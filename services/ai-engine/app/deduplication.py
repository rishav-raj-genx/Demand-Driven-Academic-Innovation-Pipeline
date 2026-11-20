from typing import Any, Dict, List, Optional
import psycopg
from app.config import Settings, get_settings


def find_top_duplicate_candidates(
    conn: psycopg.Connection,
    challenge_id: str,
    embedding: list[float],
    limit: int = 5,
) -> List[Dict[str, Any]]:
    """
    Queries canonical challenges (canonical_id IS NULL, id != current_id, embedding IS NOT NULL)
    ordered by cosine distance to find potential duplicate candidates.
    """
    query = """
        SELECT 
            id,
            title,
            problem_statement,
            domain,
            endorsement_count,
            (1.0 - (embedding <=> %s::vector)) AS similarity
        FROM challenges
        WHERE 
            canonical_id IS NULL
            AND id != %s::uuid
            AND embedding IS NOT NULL
        ORDER BY embedding <=> %s::vector ASC
        LIMIT %s;
    """
    with conn.cursor() as cur:
        cur.execute(query, (embedding, challenge_id, embedding, limit))
        rows = cur.fetchall()

        candidates: List[Dict[str, Any]] = []
        for r in rows:
            candidates.append(
                {
                    "id": str(r[0]),
                    "title": r[1],
                    "problem_statement": r[2],
                    "domain": r[3],
                    "endorsement_count": r[4],
                    "similarity": float(r[5]),
                }
            )
        return candidates


def run_deduplication(
    conn: psycopg.Connection,
    challenge_id: str,
    embedding: list[float],
    settings: Optional[Settings] = None,
) -> Dict[str, Any]:
    """
    Evaluates semantic deduplication against existing canonical challenges.
    If top candidate similarity >= DEDUP_SIMILARITY_THRESHOLD (0.85):
      - Marks challenge status = 'DUPLICATE_MERGED'
      - Sets canonical_id = top_match_id
      - Increments canonical challenge endorsement_count
      - Executes atomically inside a single DB transaction.
    """
    if settings is None:
        settings = get_settings()

    threshold = settings.DEDUP_SIMILARITY_THRESHOLD

    # 1. Fetch top duplicate candidates
    candidates = find_top_duplicate_candidates(conn, challenge_id, embedding, limit=5)

    if not candidates:
        return {
            "is_duplicate": False,
            "canonical_id": None,
            "duplicate_of_id": None,
            "similarity": None,
            "duplicate_similarity": None,
            "canonical_title": None,
            "top_candidates": [],
        }

    top_candidate = candidates[0]
    top_similarity = top_candidate["similarity"]

    if top_similarity >= threshold:
        canonical_id = top_candidate["id"]
        canonical_title = top_candidate["title"]

        with conn.cursor() as cur:
            # Check if this challenge is already merged to the same canonical parent
            cur.execute(
                "SELECT canonical_id, status FROM challenges WHERE id = %s::uuid;",
                (challenge_id,),
            )
            current_row = cur.fetchone()
            already_merged = (
                current_row is not None
                and current_row[0] is not None
                and str(current_row[0]) == canonical_id
                and current_row[1] == "DUPLICATE_MERGED"
            )

            # Update challenge status and link canonical parent
            cur.execute(
                """
                UPDATE challenges
                SET 
                    status = 'DUPLICATE_MERGED',
                    canonical_id = %s::uuid,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = %s::uuid;
                """,
                (canonical_id, challenge_id),
            )

            # Increment canonical endorsement count only if not already merged to avoid double counting
            if not already_merged:
                cur.execute(
                    """
                    UPDATE challenges
                    SET 
                        endorsement_count = endorsement_count + 1,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = %s::uuid;
                    """,
                    (canonical_id,),
                )

        conn.commit()

        return {
            "is_duplicate": True,
            "canonical_id": canonical_id,
            "duplicate_of_id": canonical_id,
            "similarity": top_similarity,
            "duplicate_similarity": top_similarity,
            "canonical_title": canonical_title,
            "top_candidates": candidates,
        }

    return {
        "is_duplicate": False,
        "canonical_id": None,
        "duplicate_of_id": None,
        "similarity": top_similarity,
        "duplicate_similarity": top_similarity,
        "canonical_title": None,
        "top_candidates": candidates,
    }
