import math
from typing import Any, Dict, List, Optional
import psycopg
from app.config import Settings, get_settings


def clamp(val: float, min_val: float = 0.0, max_val: float = 1.0) -> float:
    return max(min_val, min(max_val, val))


def compute_match_score(
    raw_similarity: float,
    distance_km: Optional[float],
    active_projects: int,
    max_capacity: int,
    soft_penalty: float = 0.25,
    hard_penalty: float = 0.45,
) -> Dict[str, float]:
    """
    Pure mathematical model for calculating capability match score with
    geospatial proximity boost and capacity utilization penalty.
    """
    # 1. Geospatial proximity boost (up to +0.08 decay over 150km)
    if distance_km is not None and distance_km >= 0:
        geo_boost = 0.08 * math.exp(-distance_km / 150.0)
    else:
        geo_boost = 0.0

    # 2. Capacity utilization & overload penalty
    capacity = max(max_capacity, 1)
    utilization = active_projects / capacity

    if utilization >= 1.0:
        capacity_penalty = hard_penalty
    else:
        capacity_penalty = soft_penalty * (utilization ** 2)

    # 3. Final composite score
    final_score = clamp(raw_similarity + geo_boost - capacity_penalty, 0.0, 1.0)

    return {
        "raw_similarity": raw_similarity,
        "distance_km": distance_km if distance_km is not None else 0.0,
        "geo_boost": geo_boost,
        "utilization": utilization,
        "capacity_penalty": capacity_penalty,
        "final_score": final_score,
    }


def generate_match_explanation(
    raw_similarity: float,
    geo_boost: float,
    distance_km: Optional[float],
    utilization: float,
    capacity_penalty: float,
    tier: str,
) -> str:
    """
    Constructs a concise, human-readable rationale for stakeholders explaining
    why an academic institution received this match ranking.
    """
    parts: List[str] = []

    # 1. Domain alignment
    if raw_similarity >= 0.75:
        parts.append(f"Strong domain match ({raw_similarity:.2f})")
    elif raw_similarity >= 0.55:
        parts.append(f"Moderate domain match ({raw_similarity:.2f})")
    elif raw_similarity >= 0.35:
        parts.append(f"Broad capability alignment ({raw_similarity:.2f})")
    else:
        parts.append(f"Exploratory domain alignment ({raw_similarity:.2f})")

    # 2. Local proximity
    if distance_km is not None and geo_boost > 0.005:
        parts.append(f"local proximity (+{geo_boost:.2f}, {distance_km:.0f}km)")
    elif distance_km is not None:
        parts.append(f"regional reach ({distance_km:.0f}km)")
    else:
        parts.append("remote collaboration")

    # 3. Capacity load / penalty
    util_pct = int(round(utilization * 100))
    if utilization >= 1.0:
        parts.append(
            f"Penalized (-{capacity_penalty:.2f}) — institution at {util_pct}% capacity; routed to available partner"
        )
    elif capacity_penalty > 0.03:
        parts.append(f"capacity load (-{capacity_penalty:.2f}, {util_pct}% active)")
    else:
        parts.append(f"no overload penalty ({util_pct}% capacity)")

    return ", ".join(parts)


def run_capability_matching(
    conn: psycopg.Connection,
    challenge_id: str,
    challenge_embedding: list[float],
    challenge_location: Any = None,
    settings: Optional[Settings] = None,
    limit: int = 5,
) -> List[Dict[str, Any]]:
    """
    Executes PostgreSQL pgvector + PostGIS capacity-aware matching query
    across all VERIFIED institutions with capability embeddings.
    Upserts Top 5 matches into capability_matches and updates challenge status to 'MATCHED'.
    """
    if settings is None:
        settings = get_settings()

    soft_penalty = settings.SOFT_CAPACITY_PENALTY
    hard_penalty = settings.HARD_CAPACITY_PENALTY

    query = """
        WITH candidate_scores AS (
            SELECT 
                i.id AS institution_id,
                i.code AS institution_code,
                i.name AS institution_name,
                i.tier AS institution_tier,
                i.active_projects,
                i.max_capacity,
                (1.0 - (i.capability_embedding <=> %s::vector)) AS raw_similarity,
                CASE 
                    WHEN i.location IS NOT NULL AND %s::geometry IS NOT NULL 
                    THEN ST_DistanceSphere(i.location, %s::geometry) / 1000.0
                    ELSE NULL 
                END AS distance_km,
                CASE 
                    WHEN i.location IS NOT NULL AND %s::geometry IS NOT NULL 
                    THEN 0.08 * exp(-(ST_DistanceSphere(i.location, %s::geometry) / 1000.0) / 150.0)
                    ELSE 0.0 
                END AS geo_boost,
                (i.active_projects::float / GREATEST(i.max_capacity, 1)) AS utilization,
                CASE 
                    WHEN (i.active_projects::float / GREATEST(i.max_capacity, 1)) >= 1.0 THEN %s::float 
                    ELSE %s::float * ((i.active_projects::float / GREATEST(i.max_capacity, 1)) ^ 2) 
                END AS capacity_penalty
            FROM institutions i
            WHERE i.verification_status = 'VERIFIED' AND i.capability_embedding IS NOT NULL
        )
        SELECT 
            institution_id,
            institution_code,
            institution_name,
            institution_tier,
            active_projects,
            max_capacity,
            raw_similarity,
            distance_km,
            geo_boost,
            utilization,
            capacity_penalty,
            LEAST(1.0, GREATEST(0.0, raw_similarity + geo_boost - capacity_penalty)) AS final_score
        FROM candidate_scores
        ORDER BY final_score DESC
        LIMIT %s;
    """

    with conn.cursor() as cur:
        cur.execute(
            query,
            (
                challenge_embedding,
                challenge_location,
                challenge_location,
                challenge_location,
                challenge_location,
                hard_penalty,
                soft_penalty,
                limit,
            ),
        )
        rows = cur.fetchall()

        matches: List[Dict[str, Any]] = []

        for rank_idx, r in enumerate(rows, start=1):
            inst_id = str(r[0])
            inst_code = r[1]
            inst_name = r[2]
            inst_tier = str(r[3])
            active_proj = int(r[4])
            max_cap = int(r[5])
            raw_sim = float(r[6])
            dist_km = float(r[7]) if r[7] is not None else None
            geo_b = float(r[8])
            util = float(r[9])
            pen = float(r[10])
            final_sc = float(r[11])

            explanation = generate_match_explanation(
                raw_similarity=raw_sim,
                geo_boost=geo_b,
                distance_km=dist_km,
                utilization=util,
                capacity_penalty=pen,
                tier=inst_tier,
            )

            matches.append(
                {
                    "rank": rank_idx,
                    "institution_id": inst_id,
                    "institution_code": inst_code,
                    "institution_name": inst_name,
                    "tier": inst_tier,
                    "active_projects": active_proj,
                    "max_capacity": max_cap,
                    "raw_similarity": raw_sim,
                    "distance_km": dist_km,
                    "geo_boost": geo_b,
                    "capacity_penalty": pen,
                    "final_score": final_sc,
                    "explanation": explanation,
                }
            )

            # Upsert into capability_matches table
            cur.execute(
                """
                INSERT INTO capability_matches (
                    id,
                    challenge_id,
                    institution_id,
                    similarity_score,
                    match_rank,
                    status,
                    feedback,
                    created_at,
                    updated_at
                ) VALUES (
                    gen_random_uuid(),
                    %s::uuid,
                    %s::uuid,
                    %s,
                    %s,
                    'SUGGESTED',
                    %s,
                    CURRENT_TIMESTAMP,
                    CURRENT_TIMESTAMP
                )
                ON CONFLICT (challenge_id, institution_id) DO UPDATE SET
                    similarity_score = EXCLUDED.similarity_score,
                    match_rank = EXCLUDED.match_rank,
                    status = EXCLUDED.status,
                    feedback = EXCLUDED.feedback,
                    updated_at = CURRENT_TIMESTAMP;
                """,
                (challenge_id, inst_id, final_sc, rank_idx, explanation),
            )

        # Update challenge status to MATCHED
        cur.execute(
            """
            UPDATE challenges
            SET status = 'MATCHED', updated_at = CURRENT_TIMESTAMP
            WHERE id = %s::uuid;
            """,
            (challenge_id,),
        )

        conn.commit()
        return matches
