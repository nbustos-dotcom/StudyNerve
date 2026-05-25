"""
Unified user context builder for AI system prompts.

build_user_context(user_id, db) -> str

Collects five data slices — all scoped to user_id — and returns a single
markdown string ready for injection into any AI system prompt.

Enable with ENABLE_USER_CONTEXT=true in backend/.env.
"""

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Attempt, Note, Question, Topic, UserSettings, VisionBoard
from app.services.gap_detector import calculate_gap_scores

log = logging.getLogger(__name__)

_MAX_CHARS = 3200  # ≈800 tokens at ~4 chars/token


async def build_user_context(user_id: int, db: AsyncSession) -> str:
    """
    Return a markdown context string for user_id, or '' if disabled / nothing found.

    Every DB query filters by user_id. Each section is wrapped in try/except
    so a single failure never crashes the endpoint.
    """
    if not settings.ENABLE_USER_CONTEXT:
        return ""

    sections: list[str] = []

    # ── 1. Last 5 wrong quiz answers ──────────────────────────────────────────
    try:
        rows = (await db.execute(
            select(Attempt, Question, Topic)
            .join(Question, Attempt.question_id == Question.id)
            .join(Topic, Question.topic_id == Topic.id)
            .where(
                Attempt.user_id == user_id,
                Attempt.is_correct == False,  # noqa: E712 — SQLAlchemy requires ==
            )
            .order_by(desc(Attempt.created_at))
            .limit(5)
        )).all()

        if rows:
            lines = ["## Recent Mistakes"]
            for attempt, question, topic in rows:
                q = question.content[:110].strip().replace("\n", " ")
                a = question.correct_answer[:70].strip().replace("\n", " ")
                lines.append(f"- **{topic.name}**: Q: {q} → Correct: {a}")
            sections.append("\n".join(lines))
    except Exception:
        log.debug("user_context: recent mistakes skipped", exc_info=True)

    # ── 2. Top 5 weak topics (gap detector) ───────────────────────────────────
    try:
        gaps = await calculate_gap_scores(db, user_id)
        if gaps:
            lines = ["## Weak Topics"]
            for g in gaps[:5]:
                pct = round(g.accuracy * 100)
                attempts_label = f"{g.total_attempts} attempt{'s' if g.total_attempts != 1 else ''}"
                lines.append(f"- **{g.topic_name}**: {pct}% accuracy ({attempts_label})")
            sections.append("\n".join(lines))
    except Exception:
        log.debug("user_context: gap scores skipped", exc_info=True)

    # ── 3. 3 most recent notes (title + first 200 chars) ─────────────────────
    try:
        notes = (await db.execute(
            select(Note)
            .where(Note.user_id == user_id)
            .where(Note.is_archived == False)  # noqa: E712
            .order_by(desc(Note.updated_at))
            .limit(3)
        )).scalars().all()

        if notes:
            lines = ["## Recent Notes"]
            for note in notes:
                snippet = (note.content or "")[:200].strip().replace("\n", " ")
                lines.append(f"- **{note.title}**: {snippet}")
            sections.append("\n".join(lines))
    except Exception:
        log.debug("user_context: recent notes skipped", exc_info=True)

    # ── 4. Canvas deadlines within 7 days ────────────────────────────────────
    try:
        user_settings = (await db.execute(
            select(UserSettings).where(UserSettings.user_id == user_id)
        )).scalar_one_or_none()

        if user_settings and user_settings.canvas_url and user_settings.canvas_token:
            from app.services.canvas import get_upcoming_assignments  # local to avoid circular import
            assignments = await get_upcoming_assignments(
                user_settings.canvas_url,
                user_settings.canvas_token,
                days=7,
            )
            if assignments:
                lines = ["## Upcoming Canvas Deadlines (next 7 days)"]
                for a in assignments[:5]:
                    due_raw = a.get("due_at", "")
                    try:
                        dt = datetime.fromisoformat(due_raw.replace("Z", "+00:00"))
                        due_str = dt.strftime("%b %d")
                    except Exception:
                        due_str = due_raw[:10] if due_raw else "no date"
                    lines.append(f"- {a['name']} — due {due_str}")
                sections.append("\n".join(lines))
    except Exception:
        log.debug("user_context: canvas deadlines skipped", exc_info=True)

    # ── 5. Active Vision Board (updated in the last hour) ────────────────────
    try:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=1)
        board = (await db.execute(
            select(VisionBoard)
            .where(
                VisionBoard.user_id == user_id,
                VisionBoard.updated_at >= cutoff,
            )
            .order_by(desc(VisionBoard.updated_at))
            .limit(1)
        )).scalar_one_or_none()

        if board:
            sections.append(f"## Active Project\n- Currently working on: **{board.title}**")
    except Exception:
        log.debug("user_context: vision board skipped", exc_info=True)

    if not sections:
        return ""

    full = "\n\n".join(sections)

    if len(full) > _MAX_CHARS:
        full = full[:_MAX_CHARS].rsplit("\n", 1)[0] + "\n[…truncated]"

    return full
