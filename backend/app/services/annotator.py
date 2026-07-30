"""AI Annotation Service — Uses Claude 3 to analyze screenshots."""

import base64
import json
import logging
from typing import Any

from anthropic import AsyncAnthropic

from app.config import get_settings
from app.services.storage import get_screenshot_bytes

logger = logging.getLogger(__name__)
settings = get_settings()


# Prompt to prevent reading exact text / PII, focusing on structure and activity
ANNOTATION_PROMPT = """
You are a privacy-preserving browser activity analyzer.
Your job is to look at a screenshot and categorize the user's high-level activity.
DO NOT read, transcribe, or output any exact text, names, emails, passwords, or numbers from the screen.
Focus entirely on the structure, UI elements, and general category of the page.

Output valid JSON ONLY matching this schema:
{
  "activity_type": "string (e.g. browsing, form_fill, media_playback, dashboard)",
  "category": "string (e.g. e-commerce, social_media, productivity, entertainment)",
  "summary": "string (A 1-2 sentence description of the visual layout and activity. Do not include specific data.)",
  "confidence": float (0.0 to 1.0)
}
"""

async def annotate_screenshot(screenshot_id: str, s3_key: str) -> None:
    """Analyze a screenshot with Claude and save the annotation to the database.
    
    Designed to be run as a background task.
    """
    from app.models.screenshot import AIAnnotation, Screenshot
    from app.database import AsyncSessionLocal
    
    if not settings.anthropic_api_key:
        logger.warning(f"[VAI] Skipping annotation for {screenshot_id}: No Anthropic API key")
        return

    async with AsyncSessionLocal() as db_session:
        try:
            import asyncio
            # 1. Fetch image bytes from S3
            image_bytes = await asyncio.to_thread(get_screenshot_bytes, s3_key)
            
            # 2. Convert to base64
            base64_image = base64.b64encode(image_bytes).decode("utf-8")
            
            # 3. Call Claude
            client = AsyncAnthropic(api_key=settings.anthropic_api_key)
            
            response = await client.messages.create(
                model="claude-3-5-sonnet-20241022",
                max_tokens=300,
                temperature=0.0,
                system="You are a JSON-only API. You output raw JSON without markdown formatting.",
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": "image/jpeg",
                                    "data": base64_image,
                                }
                            },
                            {
                                "type": "text",
                                "text": ANNOTATION_PROMPT
                            }
                        ]
                    }
                ]
            )
            
            # 4. Parse response
            result_text = response.content[0].text.strip()
            
            # Handle cases where Claude wraps JSON in markdown blocks despite instructions
            if result_text.startswith("```json"):
                result_text = result_text[7:]
            if result_text.endswith("```"):
                result_text = result_text[:-3]
                
            data = json.loads(result_text.strip())
            
            # 5. Save to database
            annotation = AIAnnotation(
                screenshot_id=screenshot_id,
                activity_type=data.get("activity_type", "unknown"),
                category=data.get("category", "unknown"),
                summary=data.get("summary", "No summary provided"),
                confidence=float(data.get("confidence", 0.5)),
            )
            
            db_session.add(annotation)
            
            # Mark screenshot as annotated
            screenshot = await db_session.get(Screenshot, screenshot_id)
            if screenshot:
                screenshot.annotated = True
                
            await db_session.commit()
            logger.info(f"[VAI] Annotated screenshot {screenshot_id}: {annotation.activity_type}")
            
        except Exception as e:
            logger.error(f"[VAI] Annotation failed for {screenshot_id}: {e}")
            await db_session.rollback()
