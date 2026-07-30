"""Install model — represents a registered extension installation.

Each Chrome Extension install gets a unique API key (hashed at rest) that
identifies all data belonging to that installation.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Install(Base):
    """Registered extension installation.

    Attributes:
        id: Unique installation identifier (UUID).
        api_key_hash: SHA-256 hash of the API key. The raw key is returned
            once at registration and never stored.
        created_at: When the installation was registered.
        last_seen_at: Last time the extension contacted the API.
    """

    __tablename__ = "installs"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    api_key_hash: Mapped[str] = mapped_column(
        String(64),
        unique=True,
        nullable=False,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"<Install id={self.id} created_at={self.created_at}>"
