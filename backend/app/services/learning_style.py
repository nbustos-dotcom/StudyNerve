"""
Learning style detector — pure heuristics, no ML.

Signal sources:
  1. Quiz attempts  — timing + correctness → pace and confidence pattern
  2. Chat messages  — length and keywords  → detail preference and explanation style
  3. Cross-signal   — chat days vs quiz accuracy → whether chat sessions help
"""

import re
from dataclasses import dataclass
from datetime import timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Attempt, ChatMessage, Note, Question, Topic

# ── Timing thresholds (seconds) ───────────────────────────────────────────────
_FAST_S = 20      # faster than this → quick recall / possibly impulsive
_THOROUGH_S = 60  # slower than this → deliberate, methodical
_MIN_TIMED = 3    # need at least this many timed attempts to judge pace

# ── Message length thresholds (characters) ───────────────────────────────────
_CONCISE_CHARS = 40
_DETAILED_CHARS = 100

# ── Style keyword patterns ────────────────────────────────────────────────────
_WHY_RE = re.compile(
    r'\b(why|explain|what is|what does|what are|meaning of|purpose of|reason|'
    r'concept|theory|principle|understand)\b',
    re.IGNORECASE,
)
_HOW_RE = re.compile(
    r'\b(how|steps?|process|procedure|algorithm|walk me|walk through|'
    r'guide|in order|first.*then|sequence)\b',
    re.IGNORECASE,
)
_EXAMPLE_RE = re.compile(
    r'\b(example|for instance|such as|show me|like what|demonstrate|'
    r'can you show|give me an?|real.world)\b',
    re.IGNORECASE,
)


@dataclass
class LearningProfile:
    style: str          # "visual" | "step-by-step" | "example-led" | "conceptual"
    pace: str           # "fast" | "moderate" | "thorough"
    detail_level: str   # "concise" | "balanced" | "detailed"
    confidence_note: str
    data_points: int    # total behavioral signals available


async def detect_learning_style(
    db: AsyncSession,
    user_id: Optional[int] = None,
) -> LearningProfile:
    """
    Analyse quiz attempts and chat history to infer how this student learns best.
    Falls back gracefully when little data exists.
    When user_id is provided, only considers data for that user.
    """
    # ── Load attempts ─────────────────────────────────────────────────────────
    print(f"[query] detect_learning_style: user_id={user_id}", flush=True)
    attempt_query = (
        select(
            Attempt.is_correct,
            Attempt.time_taken_seconds,
            Attempt.created_at,
        )
        .select_from(Attempt)
        .order_by(Attempt.created_at)
    )

    if user_id is not None:
        attempt_query = (
            attempt_query
            .join(Question, Attempt.question_id == Question.id)
            .join(Topic, Question.topic_id == Topic.id)
            .join(Note, Topic.note_id == Note.id)
            .where(Note.user_id == user_id)
        )

    attempt_rows = (await db.execute(attempt_query)).all()
    print(f"[query] detect_learning_style: attempt_rows={len(attempt_rows)} for user_id={user_id}", flush=True)

    # ── Load chat messages ────────────────────────────────────────────────────
    chat_query = (
        select(ChatMessage.content, ChatMessage.created_at)
        .where(ChatMessage.role == "user")
        .order_by(ChatMessage.created_at)
    )

    if user_id is not None:
        chat_query = chat_query.where(ChatMessage.user_id == user_id)
    print(f"[query] detect_learning_style: chat WHERE user_id={user_id}", flush=True)

    chat_rows = (await db.execute(chat_query)).all()

    data_points = len(attempt_rows) + len(chat_rows)

    pace = _detect_pace(attempt_rows)
    style = _detect_style(chat_rows)
    detail_level = _detect_detail_level(chat_rows)
    confidence_note = _build_confidence_note(attempt_rows, chat_rows)

    return LearningProfile(
        style=style,
        pace=pace,
        detail_level=detail_level,
        confidence_note=confidence_note,
        data_points=data_points,
    )


# ── Individual signal detectors ───────────────────────────────────────────────

def _detect_pace(attempts: list) -> str:
    timed = [a for a in attempts if a.time_taken_seconds is not None]
    if len(timed) < _MIN_TIMED:
        return "moderate"

    avg_time = sum(a.time_taken_seconds for a in timed) / len(timed)
    if avg_time < _FAST_S:
        return "fast"
    if avg_time > _THOROUGH_S:
        return "thorough"
    return "moderate"


def _detect_style(chat_rows: list) -> str:
    if not chat_rows:
        return "conceptual"

    combined = " ".join(m.content for m in chat_rows)
    avg_len = sum(len(m.content) for m in chat_rows) / len(chat_rows)

    scores = {
        "conceptual":   len(_WHY_RE.findall(combined)),
        "step-by-step": len(_HOW_RE.findall(combined)),
        "example-led":  len(_EXAMPLE_RE.findall(combined)),
        "visual":       2 if avg_len < _CONCISE_CHARS else 0,
    }

    if all(v == 0 for v in scores.values()):
        return "conceptual"

    order = ["conceptual", "step-by-step", "example-led", "visual"]
    best_score = max(scores.values())
    for candidate in order:
        if scores[candidate] == best_score:
            return candidate

    return "conceptual"


def _detect_detail_level(chat_rows: list) -> str:
    if not chat_rows:
        return "balanced"

    avg_len = sum(len(m.content) for m in chat_rows) / len(chat_rows)
    questions_per_msg = sum(m.content.count("?") for m in chat_rows) / len(chat_rows)

    if avg_len < _CONCISE_CHARS and questions_per_msg < 1.0:
        return "concise"
    if avg_len > _DETAILED_CHARS or questions_per_msg > 1.5:
        return "detailed"
    return "balanced"


def _build_confidence_note(attempts: list, chat_rows: list) -> str:
    if not attempts:
        return (
            "No quiz data yet — learning profile will sharpen as the student "
            "completes more quizzes."
        )

    total = len(attempts)
    correct = sum(1 for a in attempts if a.is_correct)
    accuracy = correct / total

    timed = [a for a in attempts if a.time_taken_seconds is not None]
    fragments: list[str] = []

    if len(timed) >= _MIN_TIMED:
        fast_correct = sum(
            1 for a in timed
            if a.time_taken_seconds < _FAST_S and a.is_correct
        )
        fast_wrong = sum(
            1 for a in timed
            if a.time_taken_seconds < _FAST_S and not a.is_correct
        )
        slow_correct = sum(
            1 for a in timed
            if a.time_taken_seconds >= _THOROUGH_S and a.is_correct
        )

        fc_ratio = fast_correct / len(timed)
        fw_ratio = fast_wrong / len(timed)
        sc_ratio = slow_correct / len(timed)

        if fc_ratio > 0.50:
            fragments.append("answers quickly and correctly — strong recall and confidence")
        elif fw_ratio > 0.30:
            fragments.append(
                "tends to rush and guess — accuracy would likely improve with "
                "a slower, more deliberate approach"
            )
        elif sc_ratio > 0.30:
            fragments.append(
                "takes time to reason through answers carefully — "
                "methodical and thorough"
            )
        else:
            fragments.append(
                f"consistent performance across different response speeds "
                f"({round(accuracy * 100)}% overall accuracy)"
            )
    else:
        if accuracy >= 0.80:
            fragments.append("high overall accuracy suggests strong grasp of material")
        elif accuracy < 0.50:
            fragments.append("accuracy below 50% — core concepts need reinforcement")
        else:
            fragments.append(
                f"overall accuracy at {round(accuracy * 100)}% — making steady progress"
            )

    if chat_rows and len(attempts) >= 5:
        chat_dates = _utc_dates(chat_rows)
        after_chat = [
            a for a in attempts
            if _utc_date(a.created_at) in chat_dates
        ]
        if len(after_chat) >= 3:
            chat_day_acc = sum(1 for a in after_chat if a.is_correct) / len(after_chat)
            delta = chat_day_acc - accuracy
            if delta > 0.10:
                fragments.append(
                    "quiz performance is noticeably better on days with chat sessions — "
                    "tutor discussions clearly reinforce understanding"
                )
            elif delta < -0.10:
                fragments.append(
                    "tends to use the tutor when struggling — quiz accuracy on those "
                    "days is lower, which is expected and healthy"
                )

    if not fragments:
        return "Developing learning profile — more activity needed for a complete picture."

    return "; ".join(fragments).capitalize() + "."


# ── Date helpers ──────────────────────────────────────────────────────────────

def _utc_date(dt):
    if dt.tzinfo is None:
        return dt.date()
    return dt.astimezone(timezone.utc).date()


def _utc_dates(rows) -> set:
    return {_utc_date(r.created_at) for r in rows}
