"""Data retention job.

Runs periodically to delete events and screenshots older than RETENTION_DAYS.
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select

from app.config import get_settings
from app.database import AsyncSessionLocal
from app.models.event import Event
from app.models.screenshot import Screenshot
from app.services.storage import delete_screenshot

logger = logging.getLogger(__name__)
settings = get_settings()


async def run_retention_purge() -> None:
    """Delete all data older than RETENTION_DAYS."""
    if settings.retention_days <= 0:
        logger.warning("[VAI] Retention days is 0 or less. Skipping purge.")
        return

    cutoff_date = datetime.now(timezone.utc) - timedelta(days=settings.retention_days)
    logger.info(f"[VAI] Starting retention purge. Cutoff: {cutoff_date.isoformat()}")

    async with AsyncSessionLocal() as db:
        try:
            # 1. Fetch old screenshots to delete from S3
            old_screenshots_query = select(Screenshot).where(Screenshot.captured_at < cutoff_date)
            result = await db.execute(old_screenshots_query)
            old_screenshots = result.scalars().all()
            
            deleted_s3 = 0
            for screenshot in old_screenshots:
                try:
                    await asyncio.to_thread(delete_screenshot, screenshot.s3_key)
                    deleted_s3 += 1
                except Exception as e:
                    logger.error(f"[VAI] Failed to delete S3 object {screenshot.s3_key}: {e}")
            
            # 2. Delete screenshots from DB (CASCADE handles ai_annotations)
            await db.execute(delete(Screenshot).where(Screenshot.captured_at < cutoff_date))
            
            # 3. Delete old events
            await db.execute(delete(Event).where(Event.created_at < cutoff_date))
            
            await db.commit()
            
            logger.info(f"[VAI] Retention purge complete. Deleted {deleted_s3} screenshots and related events.")
            
        except Exception as e:
            logger.error(f"[VAI] Retention purge failed: {e}")
            await db.rollback()
