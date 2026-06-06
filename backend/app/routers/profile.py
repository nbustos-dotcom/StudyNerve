from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import Integer, cast, delete as sa_delete, func, select, union_all
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import (
    Attempt, Flashcard, Note, Question, StudentInsight, User,
)
from app.routers.auth import get_current_user
from app.schemas import LearningStyleResponse, StudentInsightResponse
from app.services.learning_style import detect_learning_style
from app.services.memory import get_insights
from app.services.subjects import normalize_subject

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
    result = await db.execute(
        sa_delete(StudentInsight).where(StudentInsight.user_id == current_user.id)
    )
    return {"deleted": result.rowcount}


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

    # ── Subjects ───────────────────────────────────────────────────────────────
    # note_count per subject

    note_by_subj: dict[str, int] = {}
    for r in (await db.execute(
        select(Note.subject, func.count(Note.id).label("cnt"))
        .where(Note.user_id == uid)
        .where(Note.is_archived == False)  # noqa: E712
        .group_by(Note.subject)
    )).all():
        key = normalize_subject(r.subject) if r.subject else ""
        note_by_subj[key] = note_by_subj.get(key, 0) + r.cnt

    # questions_answered + correct per subject (via Note.subject on each question's note)
    acc_by_subj: dict[str, tuple[int, int]] = {}
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
        .where(Note.is_archived == False)  # noqa: E712
        .group_by(Note.subject)
    )).all():
        key = normalize_subject(r.subject) if r.subject else ""
        prev_total, prev_correct = acc_by_subj.get(key, (0, 0))
        acc_by_subj[key] = (prev_total + r.total, prev_correct + int(r.correct or 0))

    all_subjects = set(note_by_subj) | set(acc_by_subj)
    subjects = []
    for name in sorted(all_subjects):
        total_att, correct_att = acc_by_subj.get(name, (0, 0))
        subjects.append({
            "name": name or "General",
            "note_count": note_by_subj.get(name, 0),
            "questions_answered": total_att,
            "correct": correct_att,
            "accuracy": correct_att / total_att if total_att > 0 else 0.0,
        })

    # ── Individual notes (one planet per note) ────────────────────────────────

    notes_rows = (await db.execute(
        select(Note.id, Note.subject, func.length(Note.content).label("cl"))
        .where(Note.user_id == uid)
        .where(Note.is_archived == False)  # noqa: E712
        .order_by(Note.id)
    )).all()
    notes_list = [
        {"id": r.id, "subject": normalize_subject(r.subject) if r.subject else "General", "content_length": r.cl or 0}
        for r in notes_rows
    ]

    # ── Study streak (consecutive active days up to today) ────────────────────

    notes_days = select(func.date(Note.created_at).label("day")).where(
        Note.user_id == uid, Note.created_at >= cutoff_30
    )
    attempts_days = select(func.date(Attempt.created_at).label("day")).where(
        Attempt.user_id == uid, Attempt.created_at >= cutoff_30
    )
    fc_days = select(func.date(Flashcard.last_reviewed).label("day")).where(
        Flashcard.user_id == uid,
        Flashcard.last_reviewed.isnot(None),
        Flashcard.last_reviewed >= cutoff_30,
    )

    combined = union_all(notes_days, attempts_days, fc_days).subquery("activity")
    day_rows = (await db.execute(
        select(combined.c.day).group_by(combined.c.day)
    )).all()

    active_days: set[date] = set()
    for row in day_rows:
        d = row.day
        if isinstance(d, str):
            d = date.fromisoformat(d)
        elif isinstance(d, datetime):
            d = d.date()
        if d is not None:
            active_days.add(d)

    today = now.date()
    streak = 0
    check = today
    while check in active_days:
        streak += 1
        check -= timedelta(days=1)

    return {
        "total_notes": total_notes,
        "total_correct": total_correct,
        "total_questions_answered": total_questions_answered,
        "total_flashcards_reviewed": total_flashcards_reviewed,
        "study_streak": streak,
        "total_study_days": len(active_days),
        # ISO YYYY-MM-DD strings (UTC) of every day in the last 30 with any
        # note/attempt/flashcard activity. Used by the Dashboard "This Week"
        # grid so it shares the same source-of-truth as study_streak.
        "activity_days": sorted(d.isoformat() for d in active_days),
        # The UTC "today" anchor the streak walk used. The client renders the
        # 7-day grid relative to this so its date keys line up exactly with
        # the activity_days strings above (no FE-local vs BE-UTC drift).
        "today": today.isoformat(),
        "subjects": subjects,
        "notes": notes_list,
    }
