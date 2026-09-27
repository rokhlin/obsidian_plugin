from fastapi import Header, HTTPException, status
from typing import Optional
from app.config import settings


async def verify_auth_token(
    authorization: Optional[str] = Header(None),
    x_auth_token: Optional[str] = Header(None, alias="X-Auth-Token"),
) -> str:
    """Validate Bearer token or X-Auth-Token header against settings.AUTH_TOKEN."""
    expected_token = settings.AUTH_TOKEN.strip() if settings.AUTH_TOKEN else ""
    if not expected_token:
        # Development warning: if no token configured, require configuration
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server AUTH_TOKEN is not configured in data/config/.env",
        )

    extracted_token = None
    if authorization:
        parts = authorization.split()
        if len(parts) == 2 and parts[0].lower() == "bearer":
            extracted_token = parts[1].strip()
        elif len(parts) == 1:
            extracted_token = parts[0].strip()

    if not extracted_token and x_auth_token:
        extracted_token = x_auth_token.strip()

    if not extracted_token or extracted_token != expected_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return extracted_token
