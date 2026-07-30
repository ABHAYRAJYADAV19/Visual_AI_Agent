"""Application configuration via environment variables.

Uses pydantic-settings to load from .env file. All secrets and tunable
parameters are centralized here.
"""

from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables / .env file."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # --- Database ---
    database_url: str = (
        "postgresql+asyncpg://vai_user:vai_local_password@localhost:5432/vai_db"
    )

    # --- Object Storage (S3-compatible / MinIO) ---
    s3_endpoint_url: str = "http://localhost:9000"
    s3_access_key: str = "minioadmin"
    s3_secret_key: str = "minioadmin"
    s3_bucket_name: str = "vai-screenshots"

    # --- Anthropic Claude API ---
    anthropic_api_key: str = ""

    # --- Data Retention ---
    retention_days: int = 30

    # --- Rate Limiting ---
    api_rate_limit: int = 100  # Max events per minute per install

    # --- Server ---
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = True


@lru_cache
def get_settings() -> Settings:
    """Return cached application settings instance."""
    return Settings()
