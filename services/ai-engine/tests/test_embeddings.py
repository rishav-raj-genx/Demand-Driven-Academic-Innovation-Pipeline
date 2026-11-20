import numpy as np
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.config import get_settings
from app.db import get_db_connection
from app.embeddings import (
    embed_text,
    embed_texts,
    build_challenge_text,
    build_institution_text,
    get_institution_profile_metadata,
)

settings = get_settings()
client = TestClient(app)
VALID_HEADERS = {"X-Internal-Service-Key": settings.INTERNAL_AI_SERVICE_KEY}


def cosine_similarity(vec_a: list[float], vec_b: list[float]) -> float:
    a = np.array(vec_a, dtype=np.float32)
    b = np.array(vec_b, dtype=np.float32)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))


def test_embedding_shape_and_l2_norm():
    """
    Acceptance Criterion 1a: Output shape is exactly 384, L2 norm approx 1.0.
    """
    text = "Dirty arsenic drinking water in village handpumps"
    embedding = embed_text(text)

    assert isinstance(embedding, list)
    assert len(embedding) == 384
    for val in embedding:
        assert isinstance(val, float)

    norm = float(np.linalg.norm(np.array(embedding, dtype=np.float32)))
    assert pytest.approx(norm, abs=1e-4) == 1.0


def test_semantic_similarity_similar_vs_unrelated():
    """
    Acceptance Criterion 1b:
    Two semantically similar civic issues score cosine similarity > 0.65,
    while unrelated topics score < 0.30.
    """
    similar_issue_1 = "Dirty arsenic drinking water in village handpumps. Severe groundwater contamination requiring water filtration."
    similar_issue_2 = "Rural groundwater contamination needing low-cost filtration. Safe drinking water purification for villages."
    unrelated_topic = "Quantum computing architectures, semiconductor lithography, and compiler optimization."

    emb_1 = embed_text(similar_issue_1)
    emb_2 = embed_text(similar_issue_2)
    emb_unrelated = embed_text(unrelated_topic)

    sim_similar = cosine_similarity(emb_1, emb_2)
    sim_unrelated = cosine_similarity(emb_1, emb_unrelated)

    # Acceptance Criteria thresholds
    assert sim_similar > 0.65, f"Expected similar similarity > 0.65, got {sim_similar}"
    assert sim_unrelated < 0.30, f"Expected unrelated similarity < 0.30, got {sim_unrelated}"


def test_canonical_challenge_text_builder_similarity():
    """
    Verifies build_challenge_text produces high semantic similarity for related challenges
    and low similarity for unrelated domains.
    """
    c1 = build_challenge_text(
        title="Dirty arsenic drinking water in village handpumps",
        description="Groundwater across rural habitations contains toxic arsenic contamination requiring village filtration units.",
        domain="Water Filtration",
    )
    c2 = build_challenge_text(
        title="Rural groundwater contamination needing low-cost filtration",
        description="Deep borewells exhibit elevated arsenic and fluoride requiring modular adsorption water filter cartridges.",
        domain="Water Filtration",
    )
    c3 = build_challenge_text(
        title="Quantum Cryptography and Distributed Blockchain Ledgers",
        description="Fault-tolerant quantum key distribution algorithms for cryptographic transactions.",
        domain="Quantum Cryptography",
    )

    emb_c1 = embed_text(c1)
    emb_c2 = embed_text(c2)
    emb_c3 = embed_text(c3)

    sim_c1_c2 = cosine_similarity(emb_c1, emb_c2)
    sim_c1_c3 = cosine_similarity(emb_c1, emb_c3)

    assert sim_c1_c2 > 0.65, f"Expected canonical challenge similarity > 0.65, got {sim_c1_c2}"
    assert sim_c1_c3 < 0.30, f"Expected canonical challenge unrelated similarity < 0.30, got {sim_c1_c3}"


def test_canonical_institution_text_builder():
    """
    Verifies build_institution_text builds clean, structured canonical representations.
    """
    inst_text = build_institution_text(
        name="National Institute of Technology Jamshedpur",
        domains=["Water Filtration", "Mining Dust/Safety"],
        faculty_specializations=["Heavy metal adsorption", "Mine ventilation"],
        lab_facilities=["Water Quality Lab", "Materials Center"],
        profile_summary="Tier-1 National Institute of Technology.",
    )

    assert "Institution: National Institute of Technology Jamshedpur" in inst_text
    assert "Domains: Water Filtration, Mining Dust/Safety" in inst_text
    assert "Faculty Specializations: Heavy metal adsorption, Mine ventilation" in inst_text
    assert "Lab Facilities: Water Quality Lab, Materials Center" in inst_text
    assert "Profile: Tier-1 National Institute of Technology." in inst_text

    # Empty fallbacks
    assert build_institution_text("Only Name") == "Institution: Only Name"
    assert build_institution_text("") == ""


def test_embed_raw_text_endpoint():
    """
    Verifies POST /internal/v1/embed/text endpoint.
    """
    res = client.post(
        "/internal/v1/embed/text",
        headers=VALID_HEADERS,
        json={"text": "Decentralized solar micro-grid with battery storage"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert data["dimensions"] == 384
    assert len(data["embedding"]) == 384


def test_embed_single_institution_endpoint():
    """
    Verifies POST /internal/v1/embed/institution endpoint updates DB record.
    """
    # 1. Fetch one seeded institution ID from DB (NIT Jamshedpur)
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, code, name FROM institutions WHERE code = 'U-0205';")
            row = cur.fetchone()
            assert row is not None, "NIT Jamshedpur (U-0205) must exist in seeded DB"
            inst_id, code, name = row

    # 2. Call embedding endpoint
    res = client.post(
        "/internal/v1/embed/institution",
        headers=VALID_HEADERS,
        json={"institution_id": str(inst_id)},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert data["institution_id"] == str(inst_id)
    assert data["code"] == "U-0205"
    assert data["embedding_dimensions"] == 384

    # 3. Verify in PostgreSQL that capability_embedding is non-null and 384 dimensions
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT capability_embedding IS NOT NULL, vector_dims(capability_embedding) "
                "FROM institutions WHERE id = %s::uuid;",
                (str(inst_id),),
            )
            has_embedding, dims = cur.fetchone()
            assert has_embedding is True
            assert dims == 384


def test_embed_institution_security_and_validation():
    """
    Verifies 401, 403, 400, and 404 security and validation errors on /internal/v1/embed/institution.
    """
    valid_uuid = "00000000-0000-0000-0000-000000000000"

    # Missing Key -> 401
    res_no_key = client.post(
        "/internal/v1/embed/institution",
        json={"institution_id": valid_uuid},
    )
    assert res_no_key.status_code == 401

    # Invalid Key -> 403
    res_bad_key = client.post(
        "/internal/v1/embed/institution",
        headers={"X-Internal-Service-Key": "wrong-key"},
        json={"institution_id": valid_uuid},
    )
    assert res_bad_key.status_code == 403

    # Invalid UUID -> 400
    res_bad_uuid = client.post(
        "/internal/v1/embed/institution",
        headers=VALID_HEADERS,
        json={"institution_id": "not-a-valid-uuid"},
    )
    assert res_bad_uuid.status_code == 400

    # Non-existent UUID -> 404
    res_not_found = client.post(
        "/internal/v1/embed/institution",
        headers=VALID_HEADERS,
        json={"institution_id": valid_uuid},
    )
    assert res_not_found.status_code == 404


def test_embed_all_institutions_batch_endpoint():
    """
    Acceptance Criterion 2:
    Execute batch institution embedding endpoint against seeded Postgres DB
    and confirm all 10 institutions have non-null capability_embedding.
    """
    res = client.post(
        "/internal/v1/embed/institutions/all",
        headers=VALID_HEADERS,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert data["count"] >= 10

    # Verify directly in PostgreSQL that all 10 seeded institutions have non-null capability_embedding
    seeded_codes = [
        "U-0205", "U-0202", "U-0210", "C-44102", "U-0203",
        "U-0207", "U-0204", "U-0208", "U-0206", "S-12055",
    ]

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT code, name, capability_embedding IS NOT NULL, vector_dims(capability_embedding)
                FROM institutions
                WHERE code = ANY(%s)
                ORDER BY code ASC;
                """,
                (seeded_codes,),
            )
            rows = cur.fetchall()

            assert len(rows) == 10, f"Expected 10 seeded institutions, found {len(rows)}"

            for code, name, has_embedding, dims in rows:
                assert has_embedding is True, f"Institution {code} ({name}) capability_embedding must not be null"
                assert dims == 384, f"Institution {code} ({name}) embedding must be 384 dimensions"
