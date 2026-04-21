from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import Integer, cast, delete as sa_delete, distinct, func, select, union_all
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import (
    Attempt, ChatMessage, Flashcard, Note, Question, QuizResult,
    StudentInsight, Topic, User, VisionBoard, VisionStep,
)
from app.routers.auth import get_current_user
from app.schemas import LearningStyleResponse, StudentInsightResponse
from app.services.learning_style import detect_learning_style
from app.services.memory import get_insights

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("/learning-style", response_model=LearningStyleResponse)
async def learning_style(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    profile = await detect_learning_style(db, user_id=current_user.id)
    return LearningStyleResponse(
        style=profile.style,
        pace=profile.pace,
        detail_level=profile.detail_level,
        confidence_note=profile.confidence_note,
        data_points=profile.data_points,
    )


@router.get("/insights", response_model=list[StudentInsightResponse])
async def student_insights(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_insights(db, user_id=current_user.id)


@router.delete("/insights", status_code=200)
async def clear_all_insights(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete every StudentInsight row for the current user — nuclear memory reset."""
    result = await db.execute(
        sa_delete(StudentInsight).where(StudentInsight.user_id == current_user.id)
    )
    deleted = result.rowcount
    return {"deleted": deleted}


@router.get("/study-universe")
async def study_universe(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    uid = current_user.id
    now = datetime.now(timezone.utc)
    cutoff_30 = now - timedelta(days=30)

    # ── Flat counts ────────────────────────────────────────────────────────────

    total_notes = await db.scalar(
        select(func.count(Note.id)).where(Note.user_id == uid)
    ) or 0

    total_topics = await db.scalar(
        select(func.count(Topic.id))
        .join(Note, Topic.note_id == Note.id)
        .where(Note.user_id == uid)
    ) or 0

    total_quizzes_taken = await db.scalar(
        select(func.count(QuizResult.id)).where(QuizResult.user_id == uid)
    ) or 0

    total_questions_answered = await db.scalar(
        select(func.count(Attempt.id)).where(Attempt.user_id == uid)
    ) or 0

    total_correct = await db.scalar(
        select(func.count(Attempt.id))
        .where(Attempt.user_id == uid)
        .where(Attempt.is_correct.is_(True))
    ) or 0

    total_flashcards_reviewed = await db.scalar(
        select(func.count(Flashcard.id))
        .where(Flashcard.user_id == uid)
        .where(Flashcard.times_reviewed > 0)
    ) or 0

    total_chat_sessions = await db.scalar(
        select(func.count(distinct(ChatMessage.session_id)))
        .where(ChatMessage.user_id == uid)
    ) or 0

    total_chat_messages = await db.scalar(
        select(func.count(ChatMessage.id)).where(ChatMessage.user_id == uid)
    ) or 0

    total_vision_boards = await db.scalar(
        select(func.count(VisionBoard.id)).where(VisionBoard.user_id == uid)
    ) or 0

    total_vision_steps_completed = await db.scalar(
        select(func.count(VisionStep.id))
        .join(VisionBoard, VisionStep.board_id == VisionBoard.id)
        .where(VisionBoard.user_id == uid)
        .where(VisionStep.is_completed.is_(True))
    ) or 0

    # ── Subjects ───────────────────────────────────────────────────────────────

    note_by_subj = {
        (r.subject or ""): r.cnt
        for r in (await db.execute(
            select(Note.subject, func.count(Note.id).label("cnt"))
            .where(Note.user_id == uid)
            .group_by(Note.subject)
        )).all()
    }

    quiz_by_subj = {
        (r.subject or ""): r.cnt
        for r in (await db.execute(
            select(Note.subject, func.count(QuizResult.id).label("cnt"))
            .join(Note, QuizResult.note_id == Note.id)
            .where(QuizResult.user_id == uid)
            .group_by(Note.subject)
        )).all()
    }

    acc_by_subj = {
        (r.subject or ""): (r.total, int(r.correct or 0))
        for r in (await db.execute(
            select(
                Note.subject,
                func.count(Attempt.id).label("total"),
                func.sum(cast(Attempt.is_correct, Integer)).label("correct"),
            )
            .join(Question, Attempt.question_id == Question.id)
            .join(Note, Question.note_id == Note.id)
            .where(Attempt.user_id == uid)
            .where(Note.user_id == uid)
            .group_by(Note.subject)
        )).all()
    }

    all_subjects = set(note_by_subj) | set(quiz_by_subj) | set(acc_by_subj)
    subjects = []
    for name in sorted(all_subjects):
        total_att, correct_att = acc_by_subj.get(name, (0, 0))
        subjects.append({
            "name": name or "Uncategorized",
            "note_count": note_by_subj.get(name, 0),
            "quiz_count": quiz_by_subj.get(name, 0),
            "accuracy": correct_att / total_att if total_att > 0 else 0.0,
        })

    # ── Daily activity (last 30 days) ──────────────────────────────────────────
    # Union of activity events: note creations, quiz attempts, user chat messages,
    # and flashcard last-review dates. Each contributes one row per event.

    notes_days = select(func.date(Note.created_at).label("day")).where(
        Note.user_id == uid, Note.created_at >= cutoff_30
    )
    attempts_days = select(func.date(Attempt.created_at).label("day")).where(
        Attempt.user_id == uid, Attempt.created_at >= cutoff_30
    )
    chat_days = select(func.date(ChatMessage.created_at).label("day")).where(
        ChatMessage.user_id == uid,
        ChatMessage.role == "user",
        ChatMessage.created_at >= cutoff_30,
    )
    fc_days = select(func.date(Flashcard.last_reviewed).label("day")).where(
        Flashcard.user_id == uid,
        Flashcard.last_reviewed.isnot(None),
        Flashcard.last_reviewed >= cutoff_30,
    )

    combined = union_all(notes_days, attempts_days, chat_days, fc_days).subquery("activity")
    daily_rows = (await db.execute(
        select(combined.c.day, func.count().label("actions"))
        .group_by(combined.c.day)
        .order_by(combined.c.day)
    )).all()

    # Normalise the day value — SQLite returns str, Postgres returns date/datetime
    day_map: dict[date, int] = {}
    for row in daily_rows:
        d = row.day
        if isinstance(d, str):
            d = date.fromisoformat(d)
        elif isinstance(d, datetime):
            d = d.date()
        if d is not None:
            day_map[d] = row.actions

    daily_activity = [
        {"date": d.isoformat(), "actions": cnt}
        for d, cnt in sorted(day_map.items())
    ]

    # ── Streak (consecutive days up to and including today) ────────────────────

    today = now.date()
    streak = 0
    check = today
    while check in day_map:
        streak += 1
        check -= timedelta(days=1)

    total_study_days = len(day_map)

    return {
        "total_notes": total_notes,
        "total_topics": total_topics,
        "total_quizzes_taken": total_quizzes_taken,
        "total_questions_answered": total_questions_answered,
        "total_correct": total_correct,
        "total_flashcards_reviewed": total_flashcards_reviewed,
        "total_chat_sessions": total_chat_sessions,
        "total_chat_messages": total_chat_messages,
        "total_vision_boards": total_vision_boards,
        "total_vision_steps_completed": total_vision_steps_completed,
        "subjects": subjects,
        "daily_activity": daily_activity,
        "study_streak": streak,
        "total_study_days": total_study_days,
    }
