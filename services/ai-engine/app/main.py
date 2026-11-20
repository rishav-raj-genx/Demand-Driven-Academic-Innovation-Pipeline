from typing import Any, Dict
from fastapi import FastAPI, Depends, Response, status
import psycopg
from app.config import Settings, get_settings
from app.security import verify_internal_service_key

app = FastAPI(
    title="SIH26043 AI Engine",
    description="Intelligent Semantic Matching, Deduplication, and PLM Capacity Engine",
    version="0.1.0",
)


def verify_pgvector_extension(db_url: str) -> tuple[bool, bool, str | None]:
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
