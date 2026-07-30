"""Screenshot model — represents a visual capture and its AI annotation."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Screenshot(Base):
    """A captured screenshot from the extension.

    Attributes:
        id: Unique identifier (UUID).
        install_id: The install that generated this screenshot.
        s3_key: The storage key where the image is saved.
        url: The URL of the page at the time of capture (redacted).
        annotated: Whether this screenshot has been processed by the AI.
        captured_at: When the screenshot was taken (client-side timestamp).
        created_at: When the screenshot was stored.
    """

    __tablename__ = "screenshots"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    install_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("installs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    s3_key: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    url: Mapped[str | None] = mapped_column(Text, nullable=True)
    annotated: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    captured_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    
    # Relationship to annotations
    annotation: Mapped["AIAnnotation"] = relationship(
        "AIAnnotation",
        back_populates="screenshot",
        cascade="all, delete-orphan",
        uselist=False,
    )

    def __repr__(self) -> str:
        return f"<Screenshot id={self.id} install={self.install_id}>"


class AIAnnotation(Base):
    """AI-generated structural/semantic annotation for a screenshot.

    Attributes:
        id: Unique identifier (UUID).
        screenshot_id: The screenshot this annotates.
        activity_type: High-level categorization (e.g., "browsing", "form_fill").
        category: More specific category (e.g., "e-commerce", "social").
        summary: Short description of the visual state (NOT reading exact text).
        confidence: AI confidence score (0.0 to 1.0).
        created_at: When the annotation was generated.
    """

    __tablename__ = "ai_annotations"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    screenshot_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("screenshots.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    activity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Relationship to screenshot
    screenshot: Mapped["Screenshot"] = relationship(
        "Screenshot", back_populates="annotation"
    )

    def __repr__(self) -> str:
        return f"<AIAnnotation id={self.id} type={self.activity_type}>"
