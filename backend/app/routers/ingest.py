"""Ingestion router — receives captured events and screenshots from the extension.

Provides:
- POST /ingest/events — batched event ingestion with rate limiting
- POST /ingest/screenshot — screenshot upload (Phase 4)
"""

import time
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.models.event import Event
from app.models.install import Install
from app.routers.auth import api_key_auth
from app.schemas.events import EventBatchRequest, EventBatchResponse

router = APIRouter(prefix="/ingest", tags=["ingest"])

settings = get_settings()

# =============================================================================
# Simple in-memory rate limiter
# Production would use Redis, but this is sufficient for v1
# =============================================================================

_rate_limit_store: dict[str, list[float]] = defaultdict(list)


def _check_rate_limit(install_id: str) -> None:
    """Check if the install has exceeded the rate limit.

    Allows `settings.api_rate_limit` events per minute per install.
    Uses a sliding window approach.

    Raises:
        HTTPException 429: If rate limit exceeded.
    """
    now = time.time()
    window_start = now - 60  # 1-minute window

    # Clean old entries
    _rate_limit_store[install_id] = [
        t for t in _rate_limit_store[install_id] if t > window_start
    ]

    if len(_rate_limit_store[install_id]) >= settings.api_rate_limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Rate limit exceeded: max {settings.api_rate_limit} events/minute",
        )

    _rate_limit_store[install_id].append(now)


# =============================================================================
# Server-side PII redaction (defense-in-depth)
# =============================================================================

import re

_SERVER_PII_PATTERNS = [
    (re.compile(r"\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b"), "[SSN REDACTED]"),
    (re.compile(r"\b(?:\d[-\s]?){13,19}\b"), "[CARD REDACTED]"),
    (re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b"), "[EMAIL REDACTED]"),
]


def _server_redact(text: str | None) -> str | None:
    """Server-side PII redaction as defense-in-depth.

    The client redacts first, but we re-check server-side in case
    the client-side redaction was bypassed or missed something.
    """
    if not text:
        return text

    for pattern, replacement in _SERVER_PII_PATTERNS:
        text = pattern.sub(replacement, text)

    return text


# =============================================================================
# Events Ingestion
# =============================================================================

@router.post(
    "/events",
    response_model=EventBatchResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Ingest a batch of browser activity events",
)
async def ingest_events(
    batch: EventBatchRequest,
    install: Install = Depends(api_key_auth),
    db: AsyncSession = Depends(get_db),
) -> EventBatchResponse:
    """Receive a batch of browser activity events from the extension.

    Events are validated, PII-redacted (defense-in-depth), rate-limited,
    and stored in the database.

    Requires Bearer token authentication.
    """
    # Rate limit check
    _check_rate_limit(install.id)

    ingested = 0

    for event_payload in batch.events:
        # Server-side redaction (defense-in-depth)
        url = _server_redact(event_payload.url)
        aria_label = None
        element_tag = None
        element_role = None
        element_id_str = None
        element_sensitive = None
        coord_x = None
        coord_y = None

        if event_payload.element:
            element_tag = event_payload.element.tag
            element_role = event_payload.element.role
            aria_label = _server_redact(event_payload.element.ariaLabel)
            element_id_str = event_payload.element.id
            element_sensitive = event_payload.element.sensitive

        if event_payload.coordinates:
            coord_x = event_payload.coordinates.x
            coord_y = event_payload.coordinates.y

        event = Event(
            install_id=install.id,
            event_type=event_payload.type,
            url=url,
            element_tag=element_tag,
            element_role=element_role,
            element_aria_label=aria_label,
            element_id=element_id_str,
            element_sensitive=element_sensitive,
            coord_x=coord_x,
            coord_y=coord_y,
            scroll_depth=event_payload.scrollDepth,
            nav_method=event_payload.method,
            event_timestamp=event_payload.timestamp,
        )

        db.add(event)
        ingested += 1

    await db.flush()

    return EventBatchResponse(ingested=ingested)
