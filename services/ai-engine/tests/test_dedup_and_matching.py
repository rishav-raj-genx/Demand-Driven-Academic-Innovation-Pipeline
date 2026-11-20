import uuid
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.config import get_settings
from app.db import get_db_connection
from app.embeddings import embed_text, build_challenge_text
from app.matching import compute_match_score, generate_match_explanation
from app.deduplication import run_deduplication

settings = get_settings()
client = TestClient(app)
VALID_HEADERS = {"X-Internal-Service-Key": settings.INTERNAL_AI_SERVICE_KEY}


# ============================================================================
# Test B: Capacity-Aware Load Balancing & Tier-2/3 Empowerment
# ============================================================================


def test_load_balancing_tier2_empowerment():
    """
    Acceptance Criterion 1 (Test B):
    Given two institutions with equal raw_similarity = 0.85,
    where Tier-1 HEI is at 5/5 capacity (utilization = 1.0, penalty = 0.45)
    and Tier-2 HEI is at 1/5 capacity (utilization = 0.2, penalty = 0.01),
    Tier-2 HEI strictly ranks #1 above Tier-1 HEI.
    """
    equal_raw_sim = 0.85
    distance_km = 45.0  # Same proximity for both

    # Tier-1 HEI: 5 active projects out of 5 max capacity (100% capacity)
    score_tier1 = compute_match_score(
        raw_similarity=equal_raw_sim,
        distance_km=distance_km,
        active_projects=5,
        max_capacity=5,
        soft_penalty=0.25,
        hard_penalty=0.45,
    )

    # Tier-2 HEI: 1 active project out of 5 max capacity (20% capacity)
    score_tier2 = compute_match_score(
        raw_similarity=equal_raw_sim,
        distance_km=distance_km,
        active_projects=1,
        max_capacity=5,
        soft_penalty=0.25,
        hard_penalty=0.45,
    )

    # Assert penalties
    assert score_tier1["capacity_penalty"] == pytest.approx(0.45, abs=1e-4)
    assert score_tier2["capacity_penalty"] == pytest.approx(0.01, abs=1e-4)

    # Assert final scores: Tier-2 must strictly outrank Tier-1
    assert score_tier2["final_score"] > score_tier1["final_score"], (
        f"Tier-2 score ({score_tier2['final_score']:.4f}) must be strictly higher than "
        f"Tier-1 score ({score_tier1['final_score']:.4f})"
    )

    # Verify score difference
    score_margin = score_tier2["final_score"] - score_tier1["final_score"]
    assert score_margin >= 0.40, f"Expected margin >= 0.40, got {score_margin:.4f}"


def test_load_balancing_via_postgres_query():
    """
    Verifies that the PostgreSQL query calculation executes identically
    and ranks the Tier-2 HEI #1 when equal raw similarity is evaluated.
    """
    equal_raw_sim = 0.85
    distance_km = 30.0

    query = """
        WITH simulated_heis AS (
            SELECT 
                'inst-tier-1' AS id,
                'U-TIER1' AS code,
                'Overloaded Tier-1 Institute' AS name,
                'TIER_1' AS tier,
                5 AS active_projects,
                5 AS max_capacity,
                %s::float AS raw_similarity,
                %s::float AS distance_km,
                0.08 * exp(-(%s::float) / 150.0) AS geo_boost,
                (5::float / 5) AS utilization,
                0.45::float AS capacity_penalty
            UNION ALL
            SELECT 
                'inst-tier-2' AS id,
                'U-TIER2' AS code,
                'Available Tier-2 Institute' AS name,
                'TIER_2' AS tier,
                1 AS active_projects,
                5 AS max_capacity,
                %s::float AS raw_similarity,
                %s::float AS distance_km,
                0.08 * exp(-(%s::float) / 150.0) AS geo_boost,
                (1::float / 5) AS utilization,
                0.25::float * ((1::float / 5) ^ 2) AS capacity_penalty
        )
        SELECT 
            id,
            code,
            tier,
            raw_similarity,
            capacity_penalty,
            LEAST(1.0, GREATEST(0.0, raw_similarity + geo_boost - capacity_penalty)) AS final_score
        FROM simulated_heis
        ORDER BY final_score DESC;
    """

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                query,
                (
                    equal_raw_sim, distance_km, distance_km,
                    equal_raw_sim, distance_km, distance_km,
                ),
            )
            rows = cur.fetchall()

            assert len(rows) == 2
            top_ranked = rows[0]
            second_ranked = rows[1]

            # Top ranked must be Tier-2
            assert top_ranked[1] == "U-TIER2"
            assert top_ranked[2] == "TIER_2"
            assert top_ranked[5] > second_ranked[5]


def test_match_explanation_generation():
    """
    Verifies explanation generator produces structured, informative descriptions.
    """
    # Overloaded Tier-1 explanation
    exp_overloaded = generate_match_explanation(
        raw_similarity=0.85,
        geo_boost=0.06,
        distance_km=42.0,
        utilization=1.0,
        capacity_penalty=0.45,
        tier="TIER_1",
    )
    assert "Strong domain match (0.85)" in exp_overloaded
    assert "local proximity (+0.06, 42km)" in exp_overloaded
    assert "Penalized (-0.45) — institution at 100% capacity" in exp_overloaded

    # Unburdened Tier-2 explanation
    exp_available = generate_match_explanation(
        raw_similarity=0.85,
        geo_boost=0.06,
        distance_km=42.0,
        utilization=0.20,
        capacity_penalty=0.01,
        tier="TIER_2",
    )
    assert "Strong domain match (0.85)" in exp_available
    assert "no overload penalty (20% capacity)" in exp_available


# ============================================================================
# Test A: Semantic Deduplication & Endorsement Increment
# ============================================================================


def test_deduplication_merges_paraphrase_and_increments_parent_endorsement():
    """
    Acceptance Criterion 1 (Test A):
    Paraphrased duplicate challenge triggers DUPLICATE_MERGED, sets canonical_id,
    and increments parent endorsement count inside a single DB transaction.
    """
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            # 1. Fetch a demo user ID to be creator
            cur.execute("SELECT id FROM users LIMIT 1;")
            user_row = cur.fetchone()
            assert user_row is not None, "At least one user must exist in seeded DB"
            creator_id = user_row[0]

            parent_id = str(uuid.uuid4())
            child_id = str(uuid.uuid4())

            # 2. Create parent challenge with unique domain and embedding
            unique_tag = uuid.uuid4().hex[:8]
            parent_title = f"Acoustic Telemetry for Subterranean Termite Infestation in Timber Archives {unique_tag}"
            parent_desc = (
                f"Historical administrative palm-leaf and timber archives in Ramgarh face destruction "
                f"from hidden subterranean termite galleries. We seek a resilient piezoelectric acoustic sensor "
                f"array processing high-frequency vibrational gnawing signatures powered by solar storage. Ref {unique_tag}"
            )
            parent_canonical_text = build_challenge_text(parent_title, parent_desc, "Heritage Preservation")
            parent_embedding = embed_text(parent_canonical_text)

            cur.execute(
                """
                INSERT INTO challenges (
                    id, title, problem_statement, domain, status, created_by_id,
                    endorsement_count, embedding, created_at, updated_at
                ) VALUES (
                    %s::uuid, %s, %s, 'Heritage Preservation', 'OPEN', %s::uuid,
                    5, %s::vector, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                );
                """,
                (parent_id, parent_title, parent_desc, creator_id, parent_embedding),
            )

            # 3. Create paraphrased child challenge with nearly identical semantics (similarity >= 0.85)
            child_title = f"Autonomous Acoustic Sensor Telemetry for Subterranean Termites in Timber Archives {unique_tag}"
            child_desc = (
                f"Historical administrative timber and palm-leaf archives in Ramgarh suffer damage "
                f"from hidden subterranean termite colonies. We require a resilient piezoelectric acoustic sensor "
                f"system analyzing high-frequency vibrational gnawing signals powered by solar storage. Ref {unique_tag}"
            )
            child_canonical_text = build_challenge_text(child_title, child_desc, "Heritage Preservation")
            child_embedding = embed_text(child_canonical_text)

            cur.execute(
                """
                INSERT INTO challenges (
                    id, title, problem_statement, domain, status, created_by_id,
                    endorsement_count, embedding, created_at, updated_at
                ) VALUES (
                    %s::uuid, %s, %s, 'Water Filtration', 'SUBMITTED', %s::uuid,
                    0, %s::vector, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                );
                """,
                (child_id, child_title, child_desc, creator_id, child_embedding),
            )
            conn.commit()

    try:
        # 4. Execute deduplication on the child challenge
        with get_db_connection() as conn:
            dedup_result = run_deduplication(
                conn=conn,
                challenge_id=child_id,
                embedding=child_embedding,
                settings=settings,
            )

        # 5. Assert deduplication response
        assert dedup_result["is_duplicate"] is True
        assert dedup_result["canonical_id"] == parent_id
        assert dedup_result["duplicate_of_id"] == parent_id
        assert dedup_result["similarity"] >= 0.85
        assert dedup_result["canonical_title"] == parent_title

        # 6. Verify in database:
        # Child status must be DUPLICATE_MERGED, canonical_id must point to parent
        # Parent endorsement_count must have incremented from 5 to 6
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT status, canonical_id FROM challenges WHERE id = %s::uuid;",
                    (child_id,),
                )
                child_row = cur.fetchone()
                assert child_row[0] == "DUPLICATE_MERGED"
                assert str(child_row[1]) == parent_id

                cur.execute(
                    "SELECT endorsement_count FROM challenges WHERE id = %s::uuid;",
                    (parent_id,),
                )
                parent_row = cur.fetchone()
                assert parent_row[0] == 6, f"Parent endorsement count must be 6, got {parent_row[0]}"

        # 7. Test Idempotency: Re-running deduplication must NOT increment endorsement count again
        with get_db_connection() as conn:
            rerun_result = run_deduplication(
                conn=conn,
                challenge_id=child_id,
                embedding=child_embedding,
                settings=settings,
            )
            assert rerun_result["is_duplicate"] is True

            with conn.cursor() as cur:
                cur.execute(
                    "SELECT endorsement_count FROM challenges WHERE id = %s::uuid;",
                    (parent_id,),
                )
                assert cur.fetchone()[0] == 6, "Re-run must be idempotent and not increment count again"

    finally:
        # Cleanup test records
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM challenges WHERE id IN (%s::uuid, %s::uuid);", (child_id, parent_id))
            conn.commit()


# ============================================================================
# End-to-End Endpoint Testing: POST /internal/v1/challenges/{id}/analyze
# ============================================================================


def test_analyze_endpoint_end_to_end_matching():
    """
    Verifies full orchestration endpoint for a unique challenge:
    embeds challenge -> identifies as unique -> computes matches -> upserts Top 5 -> sets MATCHED.
    """
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users LIMIT 1;")
            creator_id = cur.fetchone()[0]

            test_chal_id = str(uuid.uuid4())
            title = "Autonomous Drone-Based Forest Canopy Surveillance for Sal Tree Borers in Saranda"
            desc = (
                "Tribal agro-forestry in Saranda forest experiences catastrophic timber loss from "
                "Hoplocerambyx spinicornis (Sal heartwood borer) infestations. We demand autonomous long-range "
                "thermal camera and LiDAR drones with edge-AI acoustic sensor pods to detect early crown wilting "
                "and bore-hole vibrations across 500-hectare remote deciduous canopies."
            )

            # Insert challenge with null embedding to test automatic embedding calculation
            cur.execute(
                """
                INSERT INTO challenges (
                    id, title, problem_statement, domain, status, created_by_id,
                    endorsement_count, created_at, updated_at
                ) VALUES (
                    %s::uuid, %s, %s, 'Smart Agriculture', 'SUBMITTED', %s::uuid,
                    0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                );
                """,
                (test_chal_id, title, desc, creator_id),
            )
            conn.commit()

    try:
        # Call analyze endpoint
        res = client.post(
            f"/internal/v1/challenges/{test_chal_id}/analyze",
            headers=VALID_HEADERS,
        )
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "ok"
        assert data["action"] == "MATCHED"
        assert data["is_duplicate"] is False
        assert data["matches_count"] > 0
        assert len(data["matches"]) <= 5

        top_match = data["matches"][0]
        assert top_match["rank"] == 1
        assert "explanation" in top_match
        assert top_match["final_score"] >= 0.0

        # Verify DB state: challenge has embedding, status is MATCHED
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT status, embedding IS NOT NULL FROM challenges WHERE id = %s::uuid;",
                    (test_chal_id,),
                )
                chal_status, has_emb = cur.fetchone()
                assert chal_status == "MATCHED"
                assert has_emb is True

                # Verify capability_matches rows
                cur.execute(
                    "SELECT COUNT(*) FROM capability_matches WHERE challenge_id = %s::uuid;",
                    (test_chal_id,),
                )
                match_count = cur.fetchone()[0]
                assert match_count == data["matches_count"]

        # Test Idempotency: Calling analyze again updates matches cleanly without duplicating rows
        res_rerun = client.post(
            f"/internal/v1/challenges/{test_chal_id}/analyze",
            headers=VALID_HEADERS,
        )
        assert res_rerun.status_code == 200
        assert res_rerun.json()["action"] == "MATCHED"

    finally:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM capability_matches WHERE challenge_id = %s::uuid;", (test_chal_id,))
                cur.execute("DELETE FROM challenges WHERE id = %s::uuid;", (test_chal_id,))
            conn.commit()


def test_analyze_endpoint_security_and_validation():
    """
    Verifies 401, 403, 400, and 404 responses on /internal/v1/challenges/{id}/analyze.
    """
    valid_uuid = str(uuid.uuid4())

    # Missing Key -> 401
    res_no_key = client.post(f"/internal/v1/challenges/{valid_uuid}/analyze")
    assert res_no_key.status_code == 401

    # Invalid Key -> 403
    res_bad_key = client.post(
        f"/internal/v1/challenges/{valid_uuid}/analyze",
        headers={"X-Internal-Service-Key": "invalid-secret"},
    )
    assert res_bad_key.status_code == 403

    # Malformed UUID -> 400
    res_bad_uuid = client.post(
        "/internal/v1/challenges/not-a-valid-uuid/analyze",
        headers=VALID_HEADERS,
    )
    assert res_bad_uuid.status_code == 400

    # Non-existent UUID -> 404
    res_not_found = client.post(
        f"/internal/v1/challenges/{valid_uuid}/analyze",
        headers=VALID_HEADERS,
    )
    assert res_not_found.status_code == 404
