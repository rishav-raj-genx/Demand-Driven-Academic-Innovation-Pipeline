from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional
import uuid
from fastapi import FastAPI, Depends, Response, HTTPException, status
from pydantic import BaseModel, Field
import psycopg
from app.config import Settings, get_settings
from app.security import verify_internal_service_key
from app.db import get_db_pool, close_db_pool, get_db_connection
from app.embeddings import (
    embed_text,
    embed_texts,
    build_challenge_text,
    build_institution_text,
    get_institution_profile_metadata,
)
from app.deduplication import run_deduplication
from app.matching import run_capability_matching


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Startup: initialize connection pool
    try:
        get_db_pool()
    except Exception as exc:
        # Allow service to start even if DB is temporarily unreachable during test spins
        print(f"Warning: DB pool initialization error on startup: {exc}")
    yield
    # Shutdown: gracefully close pool
    close_db_pool()


app = FastAPI(
    title="SIH26043 AI Engine",
    description="Intelligent Semantic Matching, Deduplication, and PLM Capacity Engine",
    version="0.1.0",
    lifespan=lifespan,
)


def verify_pgvector_extension(db_url: str) -> tuple[bool, bool, Optional[str]]:
    """
    Checks database reachability and pgvector extension registration.
    """
    cleaned_url = db_url.split("?")[0]
    try:
        with psycopg.connect(cleaned_url, connect_timeout=3) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT extname FROM pg_extension WHERE extname = 'vector';"
                )
                row = cur.fetchone()
                has_vector = row is not None and row[0] == "vector"
                return True, has_vector, None
    except Exception as exc:
        return False, False, str(exc)


# ============================================================================
# Request / Response Schemas
# ============================================================================


class EmbedTextRequest(BaseModel):
    text: str = Field(..., min_length=1, description="Input text to embed")


class EmbedChallengeRequest(BaseModel):
    title: str = Field(..., min_length=1)
    description: str = Field(..., min_length=1)
    domain: Optional[str] = None


class EmbedInstitutionRequest(BaseModel):
    institution_id: str = Field(
        ..., description="UUID of the institution to compute capability embedding for"
    )
    domains: Optional[List[str]] = None
    faculty_specializations: Optional[List[str]] = None
    lab_facilities: Optional[List[str]] = None
    profile_summary: Optional[str] = None


# ============================================================================
# Public Health & Diagnostic Endpoints
# ============================================================================


@app.get("/health", response_model=Dict[str, Any])
def health_check(
    response: Response,
    settings: Settings = Depends(get_settings),
) -> Dict[str, Any]:
    """
    Public health check endpoint.
    Verifies PostgreSQL connection and pgvector extension presence.
    """
    db_connected, pgvector_enabled, error_msg = verify_pgvector_extension(
        settings.DATABASE_URL
    )

    if not db_connected or not pgvector_enabled:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {
            "status": "unhealthy",
            "database_connected": db_connected,
            "pgvector": pgvector_enabled,
            "error": error_msg,
        }

    return {
        "status": "ok",
        "pgvector": True,
    }


# ============================================================================
# Authenticated Internal AI Service Endpoints
# ============================================================================


@app.get("/internal/v1/ping", response_model=Dict[str, str])
def internal_ping(
    _service_key: str = Depends(verify_internal_service_key),
) -> Dict[str, str]:
    """
    Authenticated internal endpoint to verify inter-service communication.
    Requires valid X-Internal-Service-Key header.
    """
    return {
        "status": "ok",
        "message": "pong",
    }


@app.post("/internal/v1/embed/text", response_model=Dict[str, Any])
def embed_raw_text(
    req: EmbedTextRequest,
    _service_key: str = Depends(verify_internal_service_key),
) -> Dict[str, Any]:
    """
    Computes an L2-normalized 384-dimensional embedding for an arbitrary text string.
    """
    vec = embed_text(req.text)
    return {
        "status": "ok",
        "dimensions": len(vec),
        "embedding": vec,
    }


@app.post("/internal/v1/embed/challenge", response_model=Dict[str, Any])
def embed_challenge(
    req: EmbedChallengeRequest,
    _service_key: str = Depends(verify_internal_service_key),
) -> Dict[str, Any]:
    """
    Constructs canonical challenge text and computes its 384-dimensional embedding.
    """
    canonical_text = build_challenge_text(
        title=req.title,
        description=req.description,
        domain=req.domain,
    )
    vec = embed_text(canonical_text)
    return {
        "status": "ok",
        "dimensions": len(vec),
        "canonical_text": canonical_text,
        "embedding": vec,
    }


@app.post("/internal/v1/embed/institution", response_model=Dict[str, Any])
def embed_institution_capability(
    req: EmbedInstitutionRequest,
    _service_key: str = Depends(verify_internal_service_key),
) -> Dict[str, Any]:
    """
    Computes and persists institutions.capability_embedding for a specific institution_id.
    Uses seeded R&D knowledge base or provided capability metadata.
    """
    try:
        valid_uuid = str(uuid.UUID(req.institution_id))
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid institution_id '{req.institution_id}': must be a valid UUID",
        )

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, code, name, tier FROM institutions WHERE id = %s::uuid;",
                (valid_uuid,),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Institution with id '{req.institution_id}' not found",
                )
            inst_id, code, name, tier = row

            # Resolve capabilities
            profile = get_institution_profile_metadata(code, name)
            domains = (
                req.domains if req.domains is not None else profile.get("domains")
            )
            faculty_spec = (
                req.faculty_specializations
                if req.faculty_specializations is not None
                else profile.get("faculty_specializations")
            )
            lab_fac = (
                req.lab_facilities
                if req.lab_facilities is not None
                else profile.get("lab_facilities")
            )
            profile_sum = (
                req.profile_summary
                if req.profile_summary is not None
                else profile.get("profile_summary")
            )

            canonical_text = build_institution_text(
                name=name,
                domains=domains,
                faculty_specializations=faculty_spec,
                lab_facilities=lab_fac,
                profile_summary=profile_sum,
            )

            embedding = embed_text(canonical_text)

            cur.execute(
                """
                UPDATE institutions
                SET capability_embedding = %s::vector, updated_at = CURRENT_TIMESTAMP
                WHERE id = %s::uuid;
                """,
                (embedding, inst_id),
            )
            conn.commit()

            return {
                "status": "ok",
                "institution_id": str(inst_id),
                "code": code,
                "name": name,
                "tier": str(tier),
                "embedding_dimensions": len(embedding),
                "canonical_text": canonical_text,
            }


@app.post("/internal/v1/embed/institutions/all", response_model=Dict[str, Any])
def embed_all_institutions(
    _service_key: str = Depends(verify_internal_service_key),
) -> Dict[str, Any]:
    """
    Computes and persists capability embeddings for all institutions in the database.
    Uses fast batch encoding to process seeded HEIs.
    """
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, code, name, tier FROM institutions ORDER BY code ASC;"
            )
            rows = cur.fetchall()

            if not rows:
                return {
                    "status": "ok",
                    "count": 0,
                    "embedded_institutions": [],
                }

            # Build canonical capability texts
            canonical_texts: List[str] = []
            for _inst_id, code, name, _tier in rows:
                profile = get_institution_profile_metadata(code, name)
                text = build_institution_text(
                    name=name,
                    domains=profile.get("domains"),
                    faculty_specializations=profile.get("faculty_specializations"),
                    lab_facilities=profile.get("lab_facilities"),
                    profile_summary=profile.get("profile_summary"),
                )
                canonical_texts.append(text)

            # Batch compute embeddings
            embeddings = embed_texts(canonical_texts)

            # Persist to PostgreSQL in single transaction
            embedded_institutions: List[Dict[str, Any]] = []
            for i, (inst_id, code, name, tier) in enumerate(rows):
                cur.execute(
                    """
                    UPDATE institutions
                    SET capability_embedding = %s::vector, updated_at = CURRENT_TIMESTAMP
                    WHERE id = %s::uuid;
                    """,
                    (embeddings[i], inst_id),
                )
                embedded_institutions.append(
                    {
                        "id": str(inst_id),
                        "code": code,
                        "name": name,
                        "tier": str(tier),
                        "embedding_dimensions": len(embeddings[i]),
                    }
                )

            conn.commit()

            return {
                "status": "ok",
                "count": len(embedded_institutions),
                "embedded_institutions": embedded_institutions,
            }


class AnalyzePendingRequest(BaseModel):
    limit: Optional[int] = Field(
        None, description="Optional maximum number of pending challenges to process"
    )
    threshold: Optional[float] = Field(
        None, description="Optional deduplication similarity threshold override"
    )
    force_reembed_all: Optional[bool] = Field(
        False, description="If true, re-processes all challenges including existing embeddings"
    )


@app.post(
    "/internal/v1/challenges/analyze-pending",
    response_model=Dict[str, Any],
)
def analyze_pending_challenges(
    req: Optional[AnalyzePendingRequest] = None,
    settings: Settings = Depends(get_settings),
    _service_key: str = Depends(verify_internal_service_key),
) -> Dict[str, Any]:
    """
    Batch processes all challenges with embedding IS NULL in chronological order (created_at ASC)
    so earlier seeded challenges act as canonical parents for later duplicates.
    Runs embedding -> deduplication -> capacity-aware capability matching.
    """
    threshold = (
        req.threshold
        if req and req.threshold is not None
        else settings.DEDUP_SIMILARITY_THRESHOLD
    )
    force = req.force_reembed_all if req else False
    limit_clause = f"LIMIT {req.limit}" if req and req.limit else ""

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            if force:
                query = f"""
                    SELECT id, title, problem_statement, domain, location
                    FROM challenges
                    ORDER BY created_at ASC
                    {limit_clause};
                """
            else:
                query = f"""
                    SELECT id, title, problem_statement, domain, location
                    FROM challenges
                    WHERE embedding IS NULL
                    ORDER BY created_at ASC
                    {limit_clause};
                """
            cur.execute(query)
            pending_challenges = cur.fetchall()

    if not pending_challenges:
        return {
            "status": "ok",
            "message": "No pending challenges to analyze",
            "total_processed": 0,
            "canonical_count": 0,
            "deduplicated_count": 0,
            "threshold": threshold,
            "results": [],
        }

    processed_results: List[Dict[str, Any]] = []
    canonical_count = 0
    dedup_count = 0

    custom_settings = Settings(
        DATABASE_URL=settings.DATABASE_URL,
        INTERNAL_AI_SERVICE_KEY=settings.INTERNAL_AI_SERVICE_KEY,
        EMBEDDING_MODEL_NAME=settings.EMBEDDING_MODEL_NAME,
        DEDUP_SIMILARITY_THRESHOLD=threshold,
        SOFT_CAPACITY_PENALTY=settings.SOFT_CAPACITY_PENALTY,
        HARD_CAPACITY_PENALTY=settings.HARD_CAPACITY_PENALTY,
    )

    with get_db_connection() as conn:
        for chal_id, title, desc, domain, loc in pending_challenges:
            str_id = str(chal_id)

            # Step 1: Compute embedding
            canonical_text = build_challenge_text(
                title=title,
                description=desc,
                domain=domain,
            )
            embedding = embed_text(canonical_text)

            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE challenges
                    SET embedding = %s::vector, updated_at = CURRENT_TIMESTAMP
                    WHERE id = %s::uuid;
                    """,
                    (embedding, str_id),
                )
            conn.commit()

            # Step 2: Deduplication Check
            dedup_res = run_deduplication(
                conn=conn,
                challenge_id=str_id,
                embedding=embedding,
                settings=custom_settings,
            )

            if dedup_res["is_duplicate"]:
                dedup_count += 1
                processed_results.append(
                    {
                        "id": str_id,
                        "title": title,
                        "action": "DUPLICATE_MERGED",
                        "canonical_id": dedup_res["canonical_id"],
                        "duplicate_of_id": dedup_res["canonical_id"],
                        "similarity": dedup_res["similarity"],
                        "canonical_title": dedup_res["canonical_title"],
                    }
                )
            else:
                # Step 3: Matchmaking
                matches = run_capability_matching(
                    conn=conn,
                    challenge_id=str_id,
                    challenge_embedding=embedding,
                    challenge_location=loc,
                    settings=custom_settings,
                    limit=5,
                )
                canonical_count += 1
                top_match = matches[0] if matches else None
                processed_results.append(
                    {
                        "id": str_id,
                        "title": title,
                        "action": "MATCHED",
                        "top_match": (
                            {
                                "institution_id": top_match["institution_id"],
                                "institution_code": top_match["institution_code"],
                                "institution_name": top_match["institution_name"],
                                "tier": top_match["tier"],
                                "final_score": top_match["final_score"],
                                "raw_similarity": top_match["raw_similarity"],
                                "explanation": top_match["explanation"],
                            }
                            if top_match
                            else None
                        ),
                        "matches_count": len(matches),
                    }
                )

    return {
        "status": "ok",
        "total_processed": len(pending_challenges),
        "canonical_count": canonical_count,
        "deduplicated_count": dedup_count,
        "threshold": threshold,
        "results": processed_results,
    }


@app.post("/internal/v1/challenges/{challenge_id}/analyze", response_model=Dict[str, Any])
def analyze_challenge(
    challenge_id: str,
    settings: Settings = Depends(get_settings),
    _service_key: str = Depends(verify_internal_service_key),
) -> Dict[str, Any]:
    """
    Orchestrates the challenge intake pipeline:
    1. Embeds challenge (title, description, domain) if embedding is null.
    2. Runs pgvector deduplication. If duplicate similarity >= threshold,
       marks status = 'DUPLICATE_MERGED', sets canonical_id, increments parent endorsement count.
    3. If unique, runs capacity-aware PostGIS + pgvector matching across verified HEIs,
       upserts Top 5 matches into capability_matches, and sets status = 'MATCHED'.
    Idempotent on re-execution.
    """
    try:
        valid_uuid = str(uuid.UUID(challenge_id))
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid challenge_id '{challenge_id}': must be a valid UUID",
        )

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, title, problem_statement, domain, status, location, embedding, canonical_id
                FROM challenges
                WHERE id = %s::uuid;
                """,
                (valid_uuid,),
            )
            row = cur.fetchone()

            if not row:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Challenge with id '{challenge_id}' not found",
                )

            chal_id, title, description, domain, current_status, location, embedding, canonical_id = row

            # Step 1: Compute embedding if null
            if embedding is None:
                canonical_text = build_challenge_text(
                    title=title,
                    description=description,
                    domain=domain,
                )
                embedding = embed_text(canonical_text)
                cur.execute(
                    """
                    UPDATE challenges
                    SET embedding = %s::vector, updated_at = CURRENT_TIMESTAMP
                    WHERE id = %s::uuid;
                    """,
                    (embedding, valid_uuid),
                )
                conn.commit()
            elif hasattr(embedding, "to_list"):
                embedding = embedding.to_list()
            elif hasattr(embedding, "tolist"):
                embedding = embedding.tolist()
            elif hasattr(embedding, "to_numpy"):
                embedding = embedding.to_numpy().tolist()
            elif not isinstance(embedding, list):
                embedding = [float(x) for x in embedding]

        # Step 2: Semantic Deduplication Check
        dedup_result = run_deduplication(
            conn=conn,
            challenge_id=valid_uuid,
            embedding=embedding,
            settings=settings,
        )

        if dedup_result["is_duplicate"]:
            return {
                "status": "ok",
                "action": "DUPLICATE_MERGED",
                "challenge_id": valid_uuid,
                "is_duplicate": True,
                "canonical_id": dedup_result["canonical_id"],
                "duplicate_of_id": dedup_result["duplicate_of_id"],
                "duplicate_similarity": dedup_result["similarity"],
                "canonical_title": dedup_result["canonical_title"],
                "message": (
                    f"Challenge identified as duplicate of '{dedup_result['canonical_title']}' "
                    f"({dedup_result['similarity']:.2%}) and merged into canonical parent."
                ),
                "top_candidates": dedup_result["top_candidates"],
            }

        # Step 3: Capacity-Aware Capability Matching
        top_matches = run_capability_matching(
            conn=conn,
            challenge_id=valid_uuid,
            challenge_embedding=embedding,
            challenge_location=location,
            settings=settings,
            limit=5,
        )

        return {
            "status": "ok",
            "action": "MATCHED",
            "challenge_id": valid_uuid,
            "is_duplicate": False,
            "matches_count": len(top_matches),
            "matches": top_matches,
        }

