from typing import Any, Dict, List
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.config import get_settings
from app.db import get_db_connection

settings = get_settings()
client = TestClient(app)
VALID_HEADERS = {"X-Internal-Service-Key": settings.INTERNAL_AI_SERVICE_KEY}


def test_seed_challenges_batch_analysis_and_evaluation():
    """
    Acceptance Criteria:
    1. All 30 seeded challenges are processed with 384-dim embeddings.
    2. Intentional duplicate pairs are detected and linked via canonical_id / duplicate_of_id.
    3. Unique challenges receive ranked capability_matches with non-zero scores.
    4. Tier-2/3 institutions appear in Rank #1 positions due to capacity load balancing
       (since NIT Jamshedpur is at full 5/5 capacity).
    """
    # 1. Trigger batch analyze-pending endpoint with calibrated threshold 0.80
    res = client.post(
        "/internal/v1/challenges/analyze-pending",
        headers=VALID_HEADERS,
        json={"threshold": 0.80},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"

    # 2. Verify all seeded challenges have non-null 384-dim embeddings in PostgreSQL
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT 
                    COUNT(*) AS total_seeded,
                    COUNT(embedding) AS embedded_count,
                    COUNT(CASE WHEN status = 'DUPLICATE_MERGED' THEN 1 END) AS duplicate_count,
                    COUNT(CASE WHEN canonical_id IS NOT NULL THEN 1 END) AS linked_duplicates,
                    COUNT(CASE WHEN status = 'MATCHED' THEN 1 END) AS matched_count
                FROM challenges
                WHERE client_idempotency_key LIKE 'jh-chal-%';
                """
            )
            row = cur.fetchone()
            total_seeded, embedded_count, duplicate_count, linked_dup, matched_count = row

            assert total_seeded == 30, f"Expected 30 seeded challenges, found {total_seeded}"
            assert embedded_count == 30, f"All 30 challenges must have embeddings, found {embedded_count}"

            # At least 2 intentional duplicate pairs detected
            assert duplicate_count >= 2, f"Expected at least 2 merged duplicates, got {duplicate_count}"
            assert linked_dup >= 2, f"Expected at least 2 linked duplicates, got {linked_dup}"
            assert matched_count >= 25, f"Expected at least 25 matched canonical challenges, got {matched_count}"

            # 3. Inspect specific intentional duplicate pairs
            # Pair 1: jh-chal-002 should be merged into jh-chal-001 (Water Filtration in Palamu)
            cur.execute(
                """
                SELECT c2.status, c2.canonical_id = c1.id, c1.endorsement_count
                FROM challenges c1
                JOIN challenges c2 ON c2.client_idempotency_key = 'jh-chal-002'
                WHERE c1.client_idempotency_key = 'jh-chal-001';
                """
            )
            p1_status, p1_is_child, p1_endorsements = cur.fetchone()
            assert p1_status == "DUPLICATE_MERGED"
            assert p1_is_child is True, "jh-chal-002 must be linked as duplicate of jh-chal-001"
            assert p1_endorsements >= 1, "jh-chal-001 endorsement count must have incremented"

            # Pair 2: jh-chal-006 should be merged into jh-chal-005 (Solar Micro-Grids in Dumka)
            cur.execute(
                """
                SELECT c2.status, c2.canonical_id = c1.id, c1.endorsement_count
                FROM challenges c1
                JOIN challenges c2 ON c2.client_idempotency_key = 'jh-chal-006'
                WHERE c1.client_idempotency_key = 'jh-chal-005';
                """
            )
            p2_status, p2_is_child, p2_endorsements = cur.fetchone()
            assert p2_status == "DUPLICATE_MERGED"
            assert p2_is_child is True, "jh-chal-006 must be linked as duplicate of jh-chal-005"
            assert p2_endorsements >= 1, "jh-chal-005 endorsement count must have incremented"

            # 4. Verify capability matches populated
            cur.execute(
                """
                SELECT 
                    COUNT(cm.id) AS total_matches,
                    COUNT(DISTINCT cm.challenge_id) AS matched_challenges,
                    MIN(cm.similarity_score) AS min_score,
                    MAX(cm.similarity_score) AS max_score
                FROM capability_matches cm
                JOIN challenges c ON cm.challenge_id = c.id
                WHERE c.client_idempotency_key LIKE 'jh-chal-%';
                """
            )
            tot_m, matched_chal, min_s, max_s = cur.fetchone()
            assert tot_m > 0
            assert matched_chal == matched_count
            assert max_s > 0.0

            # 5. Verify Tier-2 and Tier-3 institutions appear in Rank #1 positions
            # Because NIT Jamshedpur is at full 5/5 capacity (penalty 0.45)
            cur.execute(
                """
                SELECT 
                    i.code,
                    i.name,
                    i.tier,
                    COUNT(cm.id) AS rank_1_count
                FROM capability_matches cm
                JOIN institutions i ON cm.institution_id = i.id
                WHERE cm.match_rank = 1
                GROUP BY i.code, i.name, i.tier
                ORDER BY rank_1_count DESC;
                """
            )
            rank1_distribution = cur.fetchall()
            assert len(rank1_distribution) > 0

            tier2_3_rank1 = sum(
                r[3] for r in rank1_distribution if r[2] in ("TIER_2", "TIER_3")
            )
            assert tier2_3_rank1 > 0, "Tier-2 and Tier-3 institutions must receive Rank #1 placements"

            # Check that specific Tier-2 and Tier-3 HEIs are represented
            rank1_codes = {r[0] for r in rank1_distribution}
            known_tier2_3 = {"C-44102", "U-0203", "U-0204", "U-0206", "U-0207", "U-0208", "S-12055"}
            intersection = rank1_codes.intersection(known_tier2_3)
            assert len(intersection) >= 2, (
                f"Expected at least 2 distinct Tier-2/3 HEIs in Rank #1, got {intersection}"
            )


def test_seed_batch_analysis_idempotency():
    """
    Calling analyze-pending when all challenges are already processed
    returns cleanly with 0 pending challenges without side-effects.
    """
    res = client.post(
        "/internal/v1/challenges/analyze-pending",
        headers=VALID_HEADERS,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert data["total_processed"] == 0
    assert data["canonical_count"] == 0
    assert data["deduplicated_count"] == 0
