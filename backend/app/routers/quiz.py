import json
import math
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import Integer, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.llm import evaluate_answer, generate_questions
from app.models import Attempt, Note, Question, QuizResult, StudySession, Topic, User
from app.providers.base import LLMTokenLimitError
from app.routers.auth import get_current_user
from app.routers.settings import get_user_llm_kwargs

_MAX_NOTE_CHARS = 3000
_BATCH_SIZE = 15  # max questions per LLM call to stay within token limits
from app.schemas import (
    AdaptiveQuizRequest,
    AnswerResult,
    AnswerSubmit,
    FlagQuestionRequest,
    OverviewStats,
    QuestionResponse,
    QuizGenerateRequest,
    QuizHistoryDetail,
    QuizHistorySave,
    QuizHistorySummary,
    SessionResponse,
    TopicAccuracy,
    TopicGapScoreResponse,
)
from app.services.gap_detector import calculate_gap_scores

router = APIRouter(prefix="/quiz", tags=["quiz"])


# ── Question generation ───────────────────────────────────────────────────────

@router.post("/generate", response_model=list[QuestionResponse])
async def generate_quiz(
    body: QuizGenerateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    note = await db.get(Note, body.note_id)
    if not note or note.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Note not found")

    if not note.content or not note.content.strip():
        raise HTTPException(
            status_code=422,
            detail="Add some content to this note before generating a quiz.",
        )

    topic_result = await db.execute(
        select(Topic).where(Topic.note_id == body.note_id).limit(1)
    )
    topic = topic_result.scalar_one_or_none()
    if topic is None:
        topic = Topic(name=note.title, subject=note.subject, note_id=note.id)
        db.add(topic)
        await db.flush()

    question_types = body.question_types or ["mcq", "short_answer"]
    count_per_type = math.ceil(body.num_questions / len(question_types))
    saved: list[Question] = []

    note_content = note.content[:_MAX_NOTE_CHARS]
    llm_kwargs = await get_user_llm_kwargs(db, current_user.id)

    for q_type in question_types:
        remaining = body.num_questions - len(saved)
        if remaining <= 0:
            break
        type_target = min(count_per_type, remaining)

        # Split into batches of _BATCH_SIZE to avoid token limits on large counts
        raw_questions: list[dict] = []
        to_generate = type_target
        while to_generate > 0:
            batch = min(_BATCH_SIZE, to_generate)
            try:
                llm_result = await generate_questions(
                    note_content=note_content,
                    topic_name=topic.name,
                    count=batch,
                    question_type=q_type,
                    **llm_kwargs,
                )
            except LLMTokenLimitError as exc:
                raise HTTPException(status_code=422, detail=exc.message)
            if llm_result is None:
                raise HTTPException(
                    status_code=502,
                    detail="LLM unavailable or failed to generate questions",
                )
            raw_questions.extend(llm_result.get("questions", []))
            to_generate -= batch

        for q_data in raw_questions:
            options = q_data.get("options")
            db_question = Question(
                topic_id=topic.id,
                note_id=note.id,
                type=q_data.get("type", q_type),
                content=q_data.get("content", ""),
                options=json.dumps(options) if options else None,
                correct_answer=str(q_data.get("correct_answer", "")),
                explanation=q_data.get("explanation"),
                difficulty=int(q_data.get("difficulty", body.difficulty or 3)),
            )
            db.add(db_question)
            saved.append(db_question)

    await db.flush()
    for q in saved:
        await db.refresh(q)

    return saved


# ── Answer submission ─────────────────────────────────────────────────────────

@router.post("/submit", response_model=AnswerResult)
async def submit_answer(
    body: AnswerSubmit,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    question = await db.get(Question, body.question_id)
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    # Verify the question belongs to the current user via its note
    _q_note = await db.get(Note, question.note_id)
    if not _q_note or _q_note.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Question not found")

    feedback: str | None = None

    if question.type == "mcq":
        is_correct = body.user_answer.strip().upper() == question.correct_answer.strip().upper()
    else:
        llm_kwargs = await get_user_llm_kwargs(db, current_user.id)
        llm_result = await evaluate_answer(
            question=question.content,
            correct_answer=question.correct_answer,
            student_answer=body.user_answer,
            **llm_kwargs,
        )
        if llm_result is None:
            is_correct = body.user_answer.strip().lower() == question.correct_answer.strip().lower()
        else:
            is_correct = bool(llm_result.get("is_correct", False))
            feedback = llm_result.get("feedback")

    attempt = Attempt(
        question_id=question.id,
        user_id=current_user.id,
        user_answer=body.user_answer,
        is_correct=is_correct,
        time_taken_seconds=body.time_taken_seconds,
    )
    db.add(attempt)
    await db.flush()
    await db.refresh(attempt)

    return AnswerResult(
        is_correct=is_correct,
        correct_answer=question.correct_answer,
        explanation=feedback or question.explanation,
        attempt_id=attempt.id,
    )


# ── Study sessions ────────────────────────────────────────────────────────────

@router.post("/session/start", response_model=SessionResponse, status_code=201)
async def start_session(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    session = StudySession(user_id=current_user.id)
    db.add(session)
    await db.flush()
    await db.refresh(session)
    return session


@router.post("/session/{session_id}/end", response_model=SessionResponse)
async def end_session(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    session = await db.get(StudySession, session_id)
    if not session or session.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Session not found")

    session.ended_at = datetime.now(timezone.utc)

    attempts_result = await db.execute(
        select(func.count(Attempt.id), func.sum(func.cast(Attempt.is_correct, Integer)))
        .join(Question, Attempt.question_id == Question.id)
        .join(Note, Question.note_id == Note.id)
        .where(Attempt.user_id == current_user.id)
        .where(Note.user_id == current_user.id)
        .where(Attempt.created_at >= session.started_at)
        .where(Attempt.created_at <= session.ended_at)
    )
    row = attempts_result.one()
    session.total_questions = row[0] or 0
    session.correct_answers = int(row[1] or 0)

    await db.flush()
    await db.refresh(session)
    return session


# ── Stats ─────────────────────────────────────────────────────────────────────

@router.get("/stats/overview", response_model=OverviewStats)
async def overview_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    print(f"[query] overview_stats: WHERE note.user_id = {current_user.id}", flush=True)
    total_notes = (
        await db.scalar(
            select(func.count(Note.id)).where(Note.user_id == current_user.id)
        )
        or 0
    )
    total_questions = (
        await db.scalar(
            select(func.count(Question.id))
            .join(Note, Question.note_id == Note.id)
            .where(Note.user_id == current_user.id)
        )
        or 0
    )
    total_attempts = (
        await db.scalar(
            select(func.count(Attempt.id))
            .join(Question, Attempt.question_id == Question.id)
            .join(Note, Question.note_id == Note.id)
            .where(Attempt.user_id == current_user.id)
            .where(Note.user_id == current_user.id)
        )
        or 0
    )
    correct_attempts = (
        await db.scalar(
            select(func.count(Attempt.id))
            .join(Question, Attempt.question_id == Question.id)
            .join(Note, Question.note_id == Note.id)
            .where(Attempt.user_id == current_user.id)
            .where(Note.user_id == current_user.id)
            .where(Attempt.is_correct.is_(True))
        )
        or 0
    )

    overall_accuracy = correct_attempts / total_attempts if total_attempts > 0 else 0.0
    topic_accuracies = await _topic_accuracies(db, current_user.id)

    return OverviewStats(
        total_notes=total_notes,
        total_questions=total_questions,
        total_attempts=total_attempts,
        overall_accuracy=overall_accuracy,
        topic_accuracies=topic_accuracies,
    )


@router.get("/stats/topics", response_model=list[TopicAccuracy])
async def topic_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await _topic_accuracies(db, current_user.id)


async def _topic_accuracies(db: AsyncSession, user_id: int) -> list[TopicAccuracy]:
    print(f"[query] _topic_accuracies: WHERE note.user_id = {user_id}", flush=True)
    result = await db.execute(
        select(
            Topic.id,
            Topic.name,
            func.count(Attempt.id).label("total"),
            func.sum(func.cast(Attempt.is_correct, Integer)).label("correct"),
        )
        .select_from(Attempt)
        .join(Question, Attempt.question_id == Question.id)
        .join(Topic, Question.topic_id == Topic.id)
        .join(Note, Question.note_id == Note.id)
        .where(Attempt.user_id == user_id)
        .where(Note.user_id == user_id)
        .group_by(Topic.id, Topic.name)
        .order_by(Topic.name)
    )
    rows = result.all()
    return [
        TopicAccuracy(
            topic_id=row.id,
            topic_name=row.name,
            total_attempts=row.total,
            correct_attempts=int(row.correct or 0),
            accuracy=int(row.correct or 0) / row.total if row.total > 0 else 0.0,
        )
        for row in rows
    ]


# ── Gap detection ─────────────────────────────────────────────────────────────

@router.get("/gaps", response_model=list[TopicGapScoreResponse])
async def get_gaps(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    print(f"[query] get_gaps: user_id={current_user.id}", flush=True)
    scores = await calculate_gap_scores(db, user_id=current_user.id)
    return [
        TopicGapScoreResponse(
            topic_id=s.topic_id,
            topic_name=s.topic_name,
            note_id=s.note_id,
            total_attempts=s.total_attempts,
            accuracy=s.accuracy,
            recency_weight=s.recency_weight,
            frequency_factor=s.frequency_factor,
            gap_score=s.gap_score,
        )
        for s in scores
    ]


@router.post("/generate-adaptive", response_model=list[QuestionResponse])
async def generate_adaptive_quiz(
    body: AdaptiveQuizRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    note = await db.get(Note, body.note_id)
    if not note or note.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Note not found")

    if not note.content or not note.content.strip():
        raise HTTPException(
            status_code=422,
            detail="Add some content to this note before generating a quiz.",
        )

    all_gaps = await calculate_gap_scores(db, user_id=current_user.id)
    note_gaps = [g for g in all_gaps if g.note_id == body.note_id]

    adaptive_note_content = note.content[:_MAX_NOTE_CHARS]
    adaptive_llm_kwargs = await get_user_llm_kwargs(db, current_user.id)

    if not note_gaps:
        topic_result = await db.execute(
            select(Topic).where(Topic.note_id == body.note_id).limit(1)
        )
        topic = topic_result.scalar_one_or_none()
        if topic is None:
            topic = Topic(name=note.title, subject=note.subject, note_id=note.id)
            db.add(topic)
            await db.flush()

        try:
            llm_result = await generate_questions(
                note_content=adaptive_note_content,
                topic_name=topic.name,
                count=body.count,
                question_type="mcq",
                **adaptive_llm_kwargs,
            )
        except LLMTokenLimitError as exc:
            raise HTTPException(status_code=422, detail=exc.message)
        if llm_result is None:
            raise HTTPException(status_code=502, detail="LLM unavailable or failed to generate questions")

        saved: list[Question] = []
        for q_data in llm_result.get("questions", []):
            options = q_data.get("options")
            db_question = Question(
                topic_id=topic.id,
                note_id=note.id,
                type=q_data.get("type", "mcq"),
                content=q_data.get("content", ""),
                options=json.dumps(options) if options else None,
                correct_answer=str(q_data.get("correct_answer", "")),
                explanation=q_data.get("explanation"),
                difficulty=int(q_data.get("difficulty", 3)),
            )
            db.add(db_question)
            saved.append(db_question)

        await db.flush()
        for q in saved:
            await db.refresh(q)
        return saved

    weakest = note_gaps[:3]
    total_gap = sum(g.gap_score for g in weakest) or 1.0

    saved: list[Question] = []
    for i, gap in enumerate(weakest):
        remaining_budget = body.count - len(saved)
        if remaining_budget <= 0:
            break

        if i == len(weakest) - 1:
            topic_count = remaining_budget
        else:
            topic_count = max(1, round(body.count * gap.gap_score / total_gap))
            topic_count = min(topic_count, remaining_budget)

        topic = await db.get(Topic, gap.topic_id)
        if topic is None:
            continue

        try:
            llm_result = await generate_questions(
                note_content=adaptive_note_content,
                topic_name=gap.topic_name,
                count=topic_count,
                question_type="mcq",
                **adaptive_llm_kwargs,
            )
        except LLMTokenLimitError as exc:
            raise HTTPException(status_code=422, detail=exc.message)
        if llm_result is None:
            continue

        for q_data in llm_result.get("questions", []):
            options = q_data.get("options")
            db_question = Question(
                topic_id=topic.id,
                note_id=note.id,
                type=q_data.get("type", "mcq"),
                content=q_data.get("content", ""),
                options=json.dumps(options) if options else None,
                correct_answer=str(q_data.get("correct_answer", "")),
                explanation=q_data.get("explanation"),
                difficulty=int(q_data.get("difficulty", 3)),
            )
            db.add(db_question)
            saved.append(db_question)

    if not saved:
        raise HTTPException(status_code=502, detail="Failed to generate adaptive questions")

    await db.flush()
    for q in saved:
        await db.refresh(q)
    return saved


# ── Quiz history ──────────────────────────────────────────────────────────────

@router.post("/history", response_model=QuizHistorySummary, status_code=201)
async def save_quiz_history(
    body: QuizHistorySave,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    record = QuizResult(
        user_id=current_user.id,
        note_id=body.note_id,
        note_title=body.note_title,
        score=body.score,
        total_questions=body.total_questions,
        questions_json=json.dumps([q.model_dump() for q in body.questions]),
    )
    db.add(record)
    await db.flush()
    await db.refresh(record)
    return QuizHistorySummary(
        id=record.id,
        note_id=record.note_id,
        note_title=record.note_title,
        score=record.score,
        total_questions=record.total_questions,
        completed_at=record.completed_at,
    )


@router.get("/history", response_model=list[QuizHistorySummary])
async def list_quiz_history(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(QuizResult)
        .where(QuizResult.user_id == current_user.id)
        .order_by(desc(QuizResult.completed_at))
        .limit(20)
    )
    rows = result.scalars().all()
    return [
        QuizHistorySummary(
            id=r.id,
            note_id=r.note_id,
            note_title=r.note_title,
            score=r.score,
            total_questions=r.total_questions,
            completed_at=r.completed_at,
        )
        for r in rows
    ]


@router.get("/history/{quiz_id}", response_model=QuizHistoryDetail)
async def get_quiz_history_detail(
    quiz_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    record = await db.get(QuizResult, quiz_id)
    if not record or record.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Quiz not found")

    questions = json.loads(record.questions_json)
    return QuizHistoryDetail(
        id=record.id,
        note_id=record.note_id,
        note_title=record.note_title,
        score=record.score,
        total_questions=record.total_questions,
        completed_at=record.completed_at,
        questions=questions,
    )


@router.patch("/history/{quiz_id}/flag-question", response_model=QuizHistoryDetail)
async def flag_quiz_question(
    quiz_id: int,
    body: FlagQuestionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    record = await db.get(QuizResult, quiz_id)
    if not record or record.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Quiz not found")

    questions = json.loads(record.questions_json)
    if body.question_index < 0 or body.question_index >= len(questions):
        raise HTTPException(status_code=400, detail="Invalid question index")

    questions[body.question_index]["is_flagged"] = body.is_flagged
    record.questions_json = json.dumps(questions)
    await db.flush()

    return QuizHistoryDetail(
        id=record.id,
        note_id=record.note_id,
        note_title=record.note_title,
        score=record.score,
        total_questions=record.total_questions,
        completed_at=record.completed_at,
        questions=questions,
    )
