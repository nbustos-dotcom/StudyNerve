"""
Long-term student memory service.

generate_insights() opens its own AsyncSessionLocal session so it is safe
to call from a FastAPI BackgroundTask (the request session will already be
committed and closed by then).

get_insights() accepts an existing session for use inside request handlers.
"""

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.llm import extract_insights as llm_extract_insights
from app.models import ChatMessage, StudentInsight, UserSettings

logger = logging.getLogger(__name__)

# Maximum conversation messages sent to LLM for insight extraction
_MAX_MESSAGES = 20


async def generate_insights(session_id: str, user_id: int) -> int:
    """
    Pull the last _MAX_MESSAGES messages from session_id, send to the LLM for
    insight extraction, then insert the results into StudentInsight.

    Uses the user's saved LLM provider + API key from UserSettings so background
    tasks honour the same provider the user chose in Settings.

    Returns the number of insights saved/updated.
    Creates its own DB session — safe to call from background tasks.
    """
    async with AsyncSessionLocal() as db:
        try:
            # ── Resolve the user's saved LLM provider and key ─────────────────
            settings_row = await db.scalar(
                select(UserSettings).where(UserSettings.user_id == user_id)
            )
            provider_name: str | None = settings_row.llm_provider if settings_row else None
            api_key: str | None = (settings_row.llm_api_key if settings_row else None) or None

            logger.info(
                "generate_insights: user=%d provider=%s key_set=%s",
                user_id,
                provider_name or "default",
                bool(api_key),
            )

            # ── Fetch recent chat messages ─────────────────────────────────────
            result = await db.execute(
                select(ChatMessage)
                .where(ChatMessage.session_id == session_id)
                .where(ChatMessage.user_id == user_id)
                .order_by(ChatMessage.created_at.desc())
                .limit(_MAX_MESSAGES)
            )
            messages = list(reversed(result.scalars().all()))

            if len(messages) < 2:
                return 0

            msg_dicts = [{"role": m.role, "content": m.content} for m in messages]
            llm_result = await llm_extract_insights(
                msg_dicts,
                provider_name=provider_name,
                api_key=api_key,
            )

            if not llm_result or not llm_result.get("insights"):
                return 0

            saved = 0

            for item in llm_result["insights"]:
                insight_text = (item.get("insight") or "").strip()
                category = (item.get("category") or "learning_pattern").strip()
                topic_name = item.get("topic_name") or None

                if not insight_text:
                    continue

                # Always insert a new row per session so that session_id reliably
                # identifies the originating session. Dedup happens at read time in
                # get_insights() — this keeps deletion clean: deleting a session
                # removes exactly its derived insight rows.
                db.add(StudentInsight(
                    insight=insight_text,
                    category=category,
                    topic_name=topic_name,
                    user_id=user_id,
                    session_id=session_id,
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
    """Return the freshest insight per (topic_name, category) for a user."""
    result = await db.execute(
        select(StudentInsight)
        .where(StudentInsight.user_id == user_id)
        .order_by(StudentInsight.updated_at.desc())
    )
    rows = result.scalars().all()
    seen: set[tuple] = set()
    deduped: list[StudentInsight] = []
    for ins in rows:
        key = (ins.topic_name, ins.category)
        if key not in seen:
            seen.add(key)
            deduped.append(ins)
    return deduped
