"""Authentication router — install registration and API key auth.

Provides:
- POST /auth/register — generates a unique API key, returns it once,
  stores the SHA-256 hash in the database.
- api_key_auth dependency — validates Bearer token against stored hashes.
"""

import hashlib
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.install import Install
from app.schemas.auth import RegisterResponse

router = APIRouter(prefix="/auth", tags=["auth"])

# Security scheme for Bearer token
security = HTTPBearer()


def _hash_api_key(api_key: str) -> str:
    """Hash an API key using SHA-256.

    We use a simple hash (not bcrypt) because API keys are high-entropy
    random strings, not user-chosen passwords. SHA-256 is sufficient and
    fast enough for per-request validation.
    """
    return hashlib.sha256(api_key.encode()).hexdigest()


def _generate_api_key() -> str:
    """Generate a cryptographically secure API key.

    Format: vai_<48 hex chars> (24 random bytes = 192 bits of entropy).
    """
    return f"vai_{secrets.token_hex(24)}"


@router.post(
    "/register",
    response_model=RegisterResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new extension installation",
)
async def register_install(
    db: AsyncSession = Depends(get_db),
) -> RegisterResponse:
    """Register a new Chrome Extension installation.

    Generates a unique API key, hashes it, and stores the hash. The raw
    API key is returned exactly once in the response — the extension must
    store it in chrome.storage.local.

    No request body needed; each call creates a new installation.
    """
    api_key = _generate_api_key()
    api_key_hash = _hash_api_key(api_key)

    install = Install(api_key_hash=api_key_hash)
    db.add(install)
    await db.flush()  # Populate install.id

    return RegisterResponse(
        install_id=install.id,
        api_key=api_key,
    )


async def api_key_auth(
    credentials: HTTPAuthorizationCredentials = Security(security),
    db: AsyncSession = Depends(get_db),
) -> Install:
    """FastAPI dependency that validates the Bearer API key.

    Looks up the SHA-256 hash of the provided token in the installs table.
    Updates last_seen_at on successful auth.

    Returns:
        The authenticated Install record.

    Raises:
        HTTPException 401: If the API key is invalid or not found.
    """
    api_key_hash = _hash_api_key(credentials.credentials)

    result = await db.execute(
        select(Install).where(Install.api_key_hash == api_key_hash)
    )
    install = result.scalar_one_or_none()

    if install is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Update last_seen_at
    install.last_seen_at = datetime.now(timezone.utc)
    await db.flush()

    return install
