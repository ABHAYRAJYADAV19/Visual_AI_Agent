"""Event model — represents captured browser activity events.

Events include clicks, scrolls, navigation, and tab focus changes.
All events are tied to a specific install via install_id.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Event(Base):
    """A captured browser activity event.

    Attributes:
        id: Unique event identifier (UUID).
        install_id: The install that generated this event.
        event_type: Type of event (click, scroll, navigation, tab_focus, tab_blur).
        url: The page URL where the event occurred (PII-redacted).
        element_tag: HTML tag of the interacted element (for clicks).
        element_role: ARIA role of the element.
        element_aria_label: ARIA label of the element.
        element_id: DOM id of the element.
        element_sensitive: Whether the element was flagged as sensitive.
        coord_x: Click X coordinate.
        coord_y: Click Y coordinate.
        scroll_depth: Scroll depth percentage (for scroll events).
        nav_method: Navigation method (pushState, popstate, pageload).
        event_timestamp: When the event occurred (client-side timestamp).
        metadata: Additional JSON metadata.
        created_at: When the event was stored in the database.
    """

    __tablename__ = "events"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    install_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("installs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    event_type: Mapped[str] = mapped_column(
        String(20), nullable=False, index=True
    )
    url: Mapped[str | None] = mapped_column(Text, nullable=True)
    element_tag: Mapped[str | None] = mapped_column(String(50), nullable=True)
    element_role: Mapped[str | None] = mapped_column(String(50), nullable=True)
    element_aria_label: Mapped[str | None] = mapped_column(
        String(200), nullable=True
    )
    element_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    element_sensitive: Mapped[bool | None] = mapped_column(nullable=True)
    coord_x: Mapped[float | None] = mapped_column(Float, nullable=True)
    coord_y: Mapped[float | None] = mapped_column(Float, nullable=True)
    scroll_depth: Mapped[int | None] = mapped_column(Integer, nullable=True)
    nav_method: Mapped[str | None] = mapped_column(String(20), nullable=True)
    event_timestamp: Mapped[int | None] = mapped_column(
        Integer, nullable=True, doc="Client-side timestamp in milliseconds"
    )
    metadata: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"<Event id={self.id} type={self.event_type}>"
