"""
Long-term student memory service.

generate_insights() opens its own AsyncSessionLocal session so it is safe
to call from a FastAPI BackgroundTask (the request session will already be
committed and closed by then).

get_insights() accepts an existing session for use inside request handlers.
"""

import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.llm import extract_insights as llm_extract_insights
from app.models import ChatMessage, StudentInsight

logger = logging.getLogger(__name__)

# Maximum conversation messages sent to LLM for insight extraction
_MAX_MESSAGES = 20


async def generate_insights(session_id: str, user_id: int) -> int:
    """
    Pull the last _MAX_MESSAGES messages from session_id, send to the LLM for
    insight extraction, then upsert the results into StudentInsight.

    Upsert logic:
      - topic_name present  → upsert by (topic_name, category, user_id)
      - topic_name absent   → always insert (no reliable dedup key)

    Returns the number of insights saved/updated.
    Creates its own DB session — safe to call from background tasks.
    """
    async with AsyncSessionLocal() as db:
        try:
            result = await db.execute(
                select(ChatMessage)
                .where(ChatMessage.session_id == session_id)
                .order_by(ChatMessage.created_at.desc())
                .limit(_MAX_MESSAGES)
            )
            messages = list(reversed(result.scalars().all()))

            if len(messages) < 2:
                return 0

            msg_dicts = [{"role": m.role, "content": m.content} for m in messages]
            llm_result = await llm_extract_insights(msg_dicts)

            if not llm_result or not llm_result.get("insights"):
                return 0

            saved = 0
            now = datetime.now(timezone.utc)

            for item in llm_result["insights"]:
                insight_text = (item.get("insight") or "").strip()
                category = (item.get("category") or "learning_pattern").strip()
                topic_name = item.get("topic_name") or None

                if not insight_text:
                    continue

                existing = None
                if topic_name:
                    existing_result = await db.execute(
                        select(StudentInsight)
                        .where(
                            StudentInsight.topic_name == topic_name,
                            StudentInsight.category == category,
                            StudentInsight.user_id == user_id,
                        )
                        .limit(1)
                    )
                    existing = existing_result.scalar_one_or_none()

                if existing:
                    existing.insight = insight_text
                    existing.updated_at = now
                else:
                    db.add(StudentInsight(
                        insight=insight_text,
                        category=category,
                        topic_name=topic_name,
                        user_id=user_id,
                    ))
                saved += 1

            await db.commit()
            logger.info("Saved %d insight(s) for session %s", saved, session_id)
            return saved

        except Exception:
            logger.exception("Failed to generate insights for session %s", session_id)
            await db.rollback()
            return 0


async def get_insights(db: AsyncSession, user_id: int) -> list[StudentInsight]:
    """Return all stored insights for a user, most recently updated first."""
    result = await db.execute(
        select(StudentInsight)
        .where(StudentInsight.user_id == user_id)
        .order_by(StudentInsight.updated_at.desc())
    )
    return result.scalars().all()
