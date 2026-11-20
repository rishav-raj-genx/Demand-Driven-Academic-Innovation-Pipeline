import hmac
from typing import Optional
from fastapi import Header, HTTPException, status, Depends
from app.config import Settings, get_settings


async def verify_internal_service_key(
    x_internal_service_key: Optional[str] = Header(None, alias="X-Internal-Service-Key"),
    settings: Settings = Depends(get_settings),
) -> str:
    """
    Validates X-Internal-Service-Key header using constant-time comparison.
    Rejects with 401 if missing, or 403 if invalid.
    """
    if not x_internal_service_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing required X-Internal-Service-Key header",
        )

    expected = settings.INTERNAL_AI_SERVICE_KEY.encode("utf-8")
    provided = x_internal_service_key.encode("utf-8")

    if not hmac.compare_digest(provided, expected):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid internal service key",
        )

    return x_internal_service_key
