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
    AdaptiveQuizRequest,
    AnswerResult,
    AnswerSubmit,
    OverviewStats,
    QuestionResponse,
    QuizGenerateRequest,
    SessionResponse,
    TopicAccuracy,
    TopicGapScoreResponse,
)
from app.services.gap_detector import calculate_gap_scores

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


# ── Gap detection ─────────────────────────────────────────────────────────────

@router.get("/gaps", response_model=list[TopicGapScoreResponse])
async def get_gaps(db: AsyncSession = Depends(get_db)):
    """Return gap scores for all topics that have attempt history, sorted weakest first."""
    scores = await calculate_gap_scores(db)
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
async def generate_adaptive_quiz(body: AdaptiveQuizRequest, db: AsyncSession = Depends(get_db)):
    """
    Generate questions focused on the weakest topics for a given note.
    Uses gap scores to pick topics; falls back to normal generation if no gap data exists.
    """
    note = await db.get(Note, body.note_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    # Get gap scores filtered to this note's topics
    all_gaps = await calculate_gap_scores(db)
    note_gaps = [g for g in all_gaps if g.note_id == body.note_id]

    # Fall back to normal generation when there's no prior attempt data for this note
    if not note_gaps:
        fallback_req = QuizGenerateRequest(note_id=body.note_id, num_questions=body.count)
        # Reuse the generate endpoint logic inline
        topic_result = await db.execute(
            select(Topic).where(Topic.note_id == body.note_id).limit(1)
        )
        topic = topic_result.scalar_one_or_none()
        if topic is None:
            topic = Topic(name=note.title, subject=note.subject, note_id=note.id)
            db.add(topic)
            await db.flush()

        llm_result = await generate_questions(
            note_content=note.content,
            topic_name=topic.name,
            count=body.count,
            question_type="mcq",
        )
        if llm_result is None:
            raise HTTPException(status_code=502, detail="Ollama unavailable or failed to generate questions")

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

    # Distribute questions across weakest topics (weighted by gap score)
    # Pick up to 3 weakest topics; give more questions to worse-scoring ones
    weakest = note_gaps[:3]
    total_gap = sum(g.gap_score for g in weakest) or 1.0

    saved: list[Question] = []
    for i, gap in enumerate(weakest):
        remaining_budget = body.count - len(saved)
        if remaining_budget <= 0:
            break

        # Last topic gets whatever is left to avoid rounding shortfall
        if i == len(weakest) - 1:
            topic_count = remaining_budget
        else:
            topic_count = max(1, round(body.count * gap.gap_score / total_gap))
            topic_count = min(topic_count, remaining_budget)

        topic = await db.get(Topic, gap.topic_id)
        if topic is None:
            continue

        llm_result = await generate_questions(
            note_content=note.content,
            topic_name=gap.topic_name,
            count=topic_count,
            question_type="mcq",
        )
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
