import json
import math
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import Integer, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.llm import evaluate_answer, generate_questions
from app.models import Attempt, Note, Question, StudySession, Topic
from app.schemas import (
    AnswerResult,
    AnswerSubmit,
    OverviewStats,
    QuestionResponse,
    QuizGenerateRequest,
    SessionResponse,
    TopicAccuracy,
)

router = APIRouter(prefix="/quiz", tags=["quiz"])


# ── Question generation ───────────────────────────────────────────────────────

@router.post("/generate", response_model=list[QuestionResponse])
async def generate_quiz(body: QuizGenerateRequest, db: AsyncSession = Depends(get_db)):
    note = await db.get(Note, body.note_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    # Resolve topic — use first existing topic or create a default one
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

    for q_type in question_types:
        remaining = body.num_questions - len(saved)
        if remaining <= 0:
            break
        batch_count = min(count_per_type, remaining)

        llm_result = await generate_questions(
            note_content=note.content,
            topic_name=topic.name,
            count=batch_count,
            question_type=q_type,
        )
        if llm_result is None:
            raise HTTPException(
                status_code=502,
                detail="Ollama unavailable or failed to generate questions",
            )

        for q_data in llm_result.get("questions", []):
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
async def submit_answer(body: AnswerSubmit, db: AsyncSession = Depends(get_db)):
    question = await db.get(Question, body.question_id)
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    feedback: str | None = None

    if question.type == "mcq":
        is_correct = body.user_answer.strip().upper() == question.correct_answer.strip().upper()
    else:
        llm_result = await evaluate_answer(
            question=question.content,
            correct_answer=question.correct_answer,
            student_answer=body.user_answer,
        )
        if llm_result is None:
            # Fall back to exact match if Ollama unavailable
            is_correct = body.user_answer.strip().lower() == question.correct_answer.strip().lower()
        else:
            is_correct = bool(llm_result.get("is_correct", False))
            feedback = llm_result.get("feedback")

    attempt = Attempt(
        question_id=question.id,
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
async def start_session(db: AsyncSession = Depends(get_db)):
    session = StudySession()
    db.add(session)
    await db.flush()
    await db.refresh(session)
    return session


@router.post("/session/{session_id}/end", response_model=SessionResponse)
async def end_session(session_id: int, db: AsyncSession = Depends(get_db)):
    session = await db.get(StudySession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    session.ended_at = datetime.now(timezone.utc)

    # Tally correct/total attempts that occurred during this session window
    attempts_result = await db.execute(
        select(func.count(Attempt.id), func.sum(func.cast(Attempt.is_correct, Integer)))
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
async def overview_stats(db: AsyncSession = Depends(get_db)):
    total_notes = await db.scalar(select(func.count(Note.id))) or 0
    total_questions = await db.scalar(select(func.count(Question.id))) or 0
    total_attempts = await db.scalar(select(func.count(Attempt.id))) or 0
    correct_attempts = (
        await db.scalar(
            select(func.count(Attempt.id)).where(Attempt.is_correct.is_(True))
        )
        or 0
    )

    overall_accuracy = correct_attempts / total_attempts if total_attempts > 0 else 0.0

    topic_accuracies = await _topic_accuracies(db)

    return OverviewStats(
        total_notes=total_notes,
        total_questions=total_questions,
        total_attempts=total_attempts,
        overall_accuracy=overall_accuracy,
        topic_accuracies=topic_accuracies,
    )


@router.get("/stats/topics", response_model=list[TopicAccuracy])
async def topic_stats(db: AsyncSession = Depends(get_db)):
    return await _topic_accuracies(db)


async def _topic_accuracies(db: AsyncSession) -> list[TopicAccuracy]:
    result = await db.execute(
        select(
            Topic.id,
            Topic.name,
            func.count(Attempt.id).label("total"),
            func.sum(func.cast(Attempt.is_correct, Integer)).label("correct"),
        )
        .join(Question, Attempt.question_id == Question.id)
        .join(Topic, Question.topic_id == Topic.id)
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
