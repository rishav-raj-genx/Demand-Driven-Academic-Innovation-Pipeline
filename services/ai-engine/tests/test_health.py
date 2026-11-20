import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.config import get_settings


@pytest.fixture
def client():
    return TestClient(app)


def test_config_defaults():
    settings = get_settings()
    assert settings.DEDUP_SIMILARITY_THRESHOLD == 0.85
    assert settings.SOFT_CAPACITY_PENALTY == 0.25
    assert settings.HARD_CAPACITY_PENALTY == 0.45
    assert settings.EMBEDDING_MODEL_NAME == "sentence-transformers/all-MiniLM-L6-v2"
    assert settings.INTERNAL_AI_SERVICE_KEY == "dev_internal_ai_service_secret_key"


def test_health_endpoint(client):
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["pgvector"] is True


def test_internal_ping_valid_key(client):
    settings = get_settings()
    response = client.get(
        "/internal/v1/ping",
        headers={"X-Internal-Service-Key": settings.INTERNAL_AI_SERVICE_KEY},
    )
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "message": "pong"}


def test_internal_ping_missing_key(client):
    response = client.get("/internal/v1/ping")
    assert response.status_code in (401, 403)


def test_internal_ping_invalid_key(client):
    response = client.get(
        "/internal/v1/ping",
        headers={"X-Internal-Service-Key": "unauthorized_forged_key"},
    )
    assert response.status_code in (401, 403)
