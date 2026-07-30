"""Data controls router — user access and deletion of their own data."""

from fastapi import APIRouter, Depends, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.event import Event
from app.models.install import Install
from app.models.screenshot import Screenshot, AIAnnotation
from app.routers.auth import api_key_auth
from app.services.storage import delete_screenshot

router = APIRouter(prefix="/data", tags=["data"])


@router.get("/me", summary="Get a summary of captured data for this install")
async def get_my_data(
    install: Install = Depends(api_key_auth),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Retrieve high-level statistics about the captured data.
    
    Includes total events, total screenshots, and a summary of recent AI annotations.
    """
    # Count events
    event_count_query = select(func.count()).select_from(Event).where(Event.install_id == install.id)
    event_count = await db.scalar(event_count_query)
    
    # Count screenshots
    screenshot_count_query = select(func.count()).select_from(Screenshot).where(Screenshot.install_id == install.id)
    screenshot_count = await db.scalar(screenshot_count_query)
    
    # Get recent annotations (last 10)
    recent_annotations_query = (
        select(AIAnnotation.activity_type, AIAnnotation.category, AIAnnotation.summary)
        .join(Screenshot)
        .where(Screenshot.install_id == install.id)
        .order_by(AIAnnotation.created_at.desc())
        .limit(10)
    )
    result = await db.execute(recent_annotations_query)
    recent_annotations = [
        {"activity": row[0], "category": row[1], "summary": row[2]} 
        for row in result.all()
    ]
    
    return {
        "install_id": install.id,
        "total_events": event_count or 0,
        "total_screenshots": screenshot_count or 0,
        "recent_activities": recent_annotations,
    }


@router.delete("/me", summary="Delete ALL data for this install")
async def delete_my_data(
    install: Install = Depends(api_key_auth),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Permanently delete all events, screenshots, and annotations for this install.
    
    This includes deleting objects from S3/MinIO.
    """
    # 1. Fetch all S3 keys for this install to delete them from object storage
    s3_keys_query = select(Screenshot.s3_key).where(Screenshot.install_id == install.id)
    result = await db.execute(s3_keys_query)
    s3_keys = result.scalars().all()
    
    import asyncio
    
    # Delete from S3 in background threads
    for key in s3_keys:
        try:
            await asyncio.to_thread(delete_screenshot, key)
        except Exception as e:
            print(f"[VAI] Failed to delete S3 object {key}: {e}")
            
    # 2. Delete from DB (CASCADE handles ai_annotations)
    await db.execute(delete(Screenshot).where(Screenshot.install_id == install.id))
    await db.execute(delete(Event).where(Event.install_id == install.id))
    
    await db.commit()
    
    return {
        "status": "success", 
        "message": "All data permanently deleted",
        "deleted_events": True,
        "deleted_screenshots": len(s3_keys)
    }
