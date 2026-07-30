"""Pydantic schemas for authentication endpoints."""

from datetime import datetime

from pydantic import BaseModel


class RegisterResponse(BaseModel):
    """Response from POST /auth/register.

    Contains the API key (returned exactly once — store it securely)
    and the install ID.
    """

    install_id: str
    api_key: str
    message: str = (
        "Store this API key securely. It will not be shown again."
    )


class InstallInfo(BaseModel):
    """Public info about an installation (no secrets)."""

    install_id: str
    created_at: datetime
    last_seen_at: datetime
