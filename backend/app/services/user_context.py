"""
Unified user context builder for AI system prompts.

build_user_context(user_id, db) -> str

Collects five data slices — all scoped to user_id — and returns a single
markdown string ready for injection into any AI system prompt.

Enable with ENABLE_USER_CONTEXT=true in backend/.env.
"""

import logging
import re
from datetime import datetime, timedelta, timezone

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Attempt, Note, Question, Topic, UserSettings

log = logging.getLogger(__name__)

_MAX_CHARS = 3200  # ≈800 tokens at ~4 chars/token

# Local mirror of chat.py's keyword extractor so we can gate without importing
# from a router module. 4+ char alpha words; stopword list kept minimal because
# we're matching against topic-name keywords already pre-filtered by the caller.
_KW_RE = re.compile(r"\b[a-zA-Z]{4,}\b")


def _topic_keywords(name: str | None) -> set[str]:
    return {w for w in _KW_RE.findall((name or "").lower())}


async def build_user_context(
    user_id: int,
    db: AsyncSession,
    message_keywords: set[str] | None = None,
) -> str:
    """
    Return a markdown context string for user_id, or '' if disabled / nothing found.

    `message_keywords` (optional) is the current user message's keyword set, used
    to gate relevance-sensitive slices (Recent Mistakes). Callers without a
    per-message context (e.g. quiz generation) leave this None, which suppresses
    those slices entirely.

    Every DB query filters by user_id. Each section is wrapped in try/except
    so a single failure never crashes the endpoint.
    """
    if not settings.ENABLE_USER_CONTEXT:
        return ""

    sections: list[str] = []

    # ── 1. Recent wrong answers, RELEVANCE-GATED ──────────────────────────────
    # Only inject when caller supplied message_keywords AND a wrong-answer row's
    # topic-name keywords overlap them. No caller-context → no section.
    if message_keywords:
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
                .limit(20)
            )).all()

            relevant_rows: list[tuple[Attempt, Question, Topic]] = []
            for attempt, question, topic in rows:
                if _topic_keywords(topic.name) & message_keywords:
                    relevant_rows.append((attempt, question, topic))
                if len(relevant_rows) >= 5:
                    break

            if relevant_rows:
                lines = [
                    "## Reference only — recent wrong answers on the topic the "
                    "student is asking about. Do NOT raise these otherwise:"
                ]
                for _attempt, question, topic in relevant_rows:
                    q = question.content[:110].strip().replace("\n", " ")
                    a = question.correct_answer[:70].strip().replace("\n", " ")
                    lines.append(f"- **{topic.name}**: Q: {q} → Correct: {a}")
                sections.append("\n".join(lines))
        except Exception:
            log.debug("user_context: recent mistakes skipped", exc_info=True)

    # NB: a "Weak Topics" slice used to live here. Removed — weak-topic context
    # is now built in chat.py with a per-message relevance gate, so injecting
    # it here too would re-introduce the "harps every message" failure mode.
    # Quiz callers that want raw gap data can call calculate_gap_scores
    # directly (and already do, in their adaptive-quiz path).

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

    if not sections:
        return ""

    full = "\n\n".join(sections)

    if len(full) > _MAX_CHARS:
        full = full[:_MAX_CHARS].rsplit("\n", 1)[0] + "\n[…truncated]"

    return full
