import re
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.llm import generate_chat
from app.models import ChatMessage, Note, Question, StudentInsight, User
from app.routers.auth import get_current_user
from app.routers.settings import get_user_llm_kwargs
from app.schemas import (
    ChatMessageResponse,
    ChatSendRequest,
    ChatSendResponse,
    ChatSessionPreview,
)
from app.services.gap_detector import calculate_gap_scores
from app.services.learning_style import LearningProfile, detect_learning_style
from app.services.memory import generate_insights, get_insights

router = APIRouter(prefix="/chat", tags=["chat"])

_NOTE_CONTENT_LIMIT = 3000
_HISTORY_LIMIT = 10

# ── Communication style detection ─────────────────────────────────────────────

_CASUAL_RE = re.compile(
    r'\b(idk|ngl|tbh|lol|lmao|omg|rn|imo|iirc|brb|btw|smh|fr|nah|yeah|yep|'
    r'gonna|wanna|kinda|sorta|cuz|bc|tho|wtf|haha|lmk|imo|fwiw|afaik|ig|'
    r'lowkey|highkey|literally|deadass|no cap|slay|vibe)\b',
    re.IGNORECASE,
)

_TECHNICAL_RE = re.compile(
    r'\b(algorithm|recursion|complexity|asymptotic|derivative|integral|gradient|'
    r'entropy|eigenvalue|polymorphism|inheritance|abstraction|instantiate|'
    r'photosynthesis|mitosis|meiosis|electromagnetism|thermodynamics|catalyst|'
    r'oxidation|reduction|neurotransmitter|metabolism|homeostasis|hypothesis|'
    r'regression|variance|correlation|paradigm|heuristic|deterministic|'
    r'stochastic|idempotent|isomorphic|polymorphic)\b',
    re.IGNORECASE,
)


def _detect_style(user_messages: list[str]) -> str:
    if not user_messages:
        return "neutral — be clear and direct"

    combined = " ".join(user_messages)
    avg_len = sum(len(m) for m in user_messages) / len(user_messages)
    punct_count = sum(1 for c in combined if c in ".!?,;:")
    punct_ratio = punct_count / max(len(combined), 1)

    casual_hits = len(_CASUAL_RE.findall(combined))
    technical_hits = len(_TECHNICAL_RE.findall(combined))

    if casual_hits >= 1 or avg_len < 25:
        return (
            "casual — talk like a person, not a textbook; "
            "use everyday language, contractions, keep it conversational; "
            "match their energy"
        )
    if technical_hits >= 2 or (avg_len > 80 and punct_ratio > 0.04):
        return (
            "technical/formal — the student is comfortable with precise vocabulary; "
            "match their level, use structured explanations, don't over-simplify"
        )
    return (
        "neutral — clear and direct; "
        "mix of plain language and key terms; "
        "don't be stiff but don't be overly casual either"
    )


# ── System prompt builder ─────────────────────────────────────────────────────

async def _build_system_prompt(
    db: AsyncSession,
    user_id: int,
    note_id: int | None,
    question_id: int | None,
    style_hint: str,
    learning_profile: LearningProfile,
    insights: list[StudentInsight],
) -> str:
    lines: list[str] = [
        "You are StudyNerve AI. You talk like a real person, not an AI. No corporate tone. "
        "No filler. No 'Great question!' No 'I'd be happy to help.' Just talk.",
        "",
        "MEMORY — YOU REMEMBER EVERYTHING:",
        "You have access to this student's history. Use it. Reference past conversations "
        "naturally: 'Last time we talked about this, you were confused about X — did that "
        "click yet?' If they struggled with something before, bring it up without being asked. "
        "If they had a breakthrough, build on it. Never act like you're meeting them for the "
        "first time.",
        "",
        "ADAPT TO THEIR VOICE:",
        "Match exactly how they type. If they use lowercase and abbreviations, you do too. "
        "If they write properly, match that. If they swear, don't flinch. If they use slang, "
        "use it back. Read their energy — if they seem frustrated, be calm and direct. If "
        "they're excited, match it. You're a mirror with expertise.",
        "",
        "SOUND HUMAN:",
        "Use contractions. Start sentences with 'So' or 'Look' or 'Here's the thing' "
        "sometimes. Pause with '—' dashes. Be blunt when needed. Have opinions. Say "
        "'honestly' when you mean it. React to what they say before answering — 'yeah that's "
        "a common trap' or 'ok so you're close but missing one thing'. Never sound like "
        "you're reading from a script.",
        "",
        "YOUR ANSWER FORMAT — EVERY SINGLE RESPONSE:",
        "- Keep the main answer SHORT. 2-4 sentences max for the core point.",
        "- Then a brief explanation with **bold** on the key concept — one short paragraph, "
        "not a wall of text.",
        "- Then ALWAYS end with a follow-up. Not a generic 'does that help?' — a specific "
        "follow-up tied to what they just asked: 'so what happens if you apply that to "
        "[related concept]?' or 'try explaining back to me what [key term] means' or 'the "
        "tricky part is [X] — want me to break that down?'",
        "- If the explanation needs steps, number them. Max 4-5 steps. Each step is ONE "
        "sentence.",
        "- Never give more than the student needs. If they asked a simple question, give a "
        "simple answer + follow-up. Don't over-explain.",
        "",
        "YOU ALWAYS DO THIS:",
        "- Reference their actual notes and weak areas when relevant",
        "- Push them to think, don't just hand them answers",
        "- If they're wrong, say so directly but show them where the thinking broke",
        "- Every response moves the conversation forward with that follow-up",
        "",
    ]

    lines.append(f"## How this student is communicating right now: {style_hint}")
    lines.append("")

    _STYLE_DESC = {
        "visual":       "concrete, direct — skip abstraction, use tables/comparisons",
        "step-by-step": "numbered steps — always break processes into ordered steps",
        "example-led":  "examples first, then theory — lead with a real example",
        "conceptual":   "big-picture — explain the WHY before the HOW",
    }
    _PACE_DESC = {
        "fast":     "picks things up fast, doesn't need hand-holding",
        "moderate": "explain fully but don't over-explain",
        "thorough": "appreciates depth, takes their time",
    }
    _DETAIL_DESC = {
        "concise":  "short direct answers, expand only if asked",
        "balanced": "enough detail to understand, no more",
        "detailed": "wants depth, examples, and edge cases",
    }

    style_desc = _STYLE_DESC.get(learning_profile.style, learning_profile.style)
    pace_desc = _PACE_DESC.get(learning_profile.pace, learning_profile.pace)
    detail_desc = _DETAIL_DESC.get(learning_profile.detail_level, learning_profile.detail_level)

    lines.append("## How this student learns best:")
    lines.append(f"- Style: **{learning_profile.style}** — {style_desc}")
    lines.append(f"- Pace: **{learning_profile.pace}** — {pace_desc}")
    lines.append(f"- Detail: **{learning_profile.detail_level}** — {detail_desc}")
    if learning_profile.data_points > 0:
        lines.append(f"- Behavioural note: {learning_profile.confidence_note}")
    lines.append("")

    if insights:
        lines.append("## What you know about this student from past sessions (use this):")
        for ins in insights[:10]:
            topic_ctx = f" [{ins.topic_name}]" if ins.topic_name else ""
            lines.append(f"- ({ins.category}{topic_ctx}) {ins.insight}")
        lines.append("")

    gaps = await calculate_gap_scores(db, user_id=user_id)
    if gaps:
        lines.append("## Topics they're struggling with (weave in when relevant):")
        for g in gaps[:5]:
            pct = round(g.accuracy * 100)
            lines.append(
                f"- **{g.topic_name}**: {pct}% accuracy over {g.total_attempts} "
                f"attempt{'s' if g.total_attempts != 1 else ''}"
            )
        lines.append("")

    if note_id is not None:
        note = await db.get(Note, note_id)
        if note and note.user_id == user_id:
            lines.append(f"## Their study material — {note.title}:")
            content = note.content
            if len(content) > _NOTE_CONTENT_LIMIT:
                content = content[:_NOTE_CONTENT_LIMIT] + "\n[…content truncated…]"
            lines.append(content)
            lines.append("")

    if question_id is not None:
        question = await db.get(Question, question_id)
        if question:
            lines.append("## Quiz question they got wrong — help them understand why, don't just give the answer:")
            lines.append(f"Question: {question.content}")
            lines.append(f"Correct answer: {question.correct_answer}")
            if question.explanation:
                lines.append(f"Explanation: {question.explanation}")
            lines.append("")

    return "\n".join(lines)


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/send", response_model=ChatSendResponse)
async def send_message(
    body: ChatSendRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    session_id = body.session_id or str(uuid.uuid4())

    history_result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .where(ChatMessage.user_id == current_user.id)
        .order_by(ChatMessage.created_at.desc())
        .limit(_HISTORY_LIMIT)
    )
    history_rows = list(reversed(history_result.scalars().all()))
    history = [{"role": m.role, "content": m.content} for m in history_rows]

    recent_user_msgs = [m.content for m in history_rows if m.role == "user"][-5:]
    style_hint = _detect_style(recent_user_msgs)

    learning_profile = await detect_learning_style(db, user_id=current_user.id)
    stored_insights = await get_insights(db, user_id=current_user.id)

    system = await _build_system_prompt(
        db, current_user.id, body.note_id, body.question_id,
        style_hint, learning_profile, stored_insights,
    )

    llm_messages = history + [{"role": "user", "content": body.message}]

    llm_kwargs = await get_user_llm_kwargs(db, current_user.id)
    response_text = await generate_chat(llm_messages, system, **llm_kwargs)
    if response_text is None:
        raise HTTPException(status_code=502, detail="LLM unavailable or failed to respond")

    db.add(ChatMessage(role="user", content=body.message, session_id=session_id, user_id=current_user.id))
    db.add(ChatMessage(role="assistant", content=response_text, session_id=session_id, user_id=current_user.id))
    await db.flush()

    user_msg_count = await db.scalar(
        select(func.count(ChatMessage.id)).where(
            ChatMessage.session_id == session_id,
            ChatMessage.user_id == current_user.id,
            ChatMessage.role == "user",
        )
    )
    if user_msg_count and user_msg_count % 5 == 0:
        background_tasks.add_task(generate_insights, session_id, current_user.id)

    return ChatSendResponse(session_id=session_id, response=response_text)


@router.get("/history/{session_id}", response_model=list[ChatMessageResponse])
async def get_history(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .where(ChatMessage.user_id == current_user.id)
        .order_by(ChatMessage.created_at)
    )
    return result.scalars().all()


@router.get("/sessions", response_model=list[ChatSessionPreview])
async def list_sessions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    first_msg_subq = (
        select(
            ChatMessage.session_id,
            func.min(ChatMessage.id).label("first_id"),
        )
        .where(ChatMessage.user_id == current_user.id)
        .group_by(ChatMessage.session_id)
        .subquery()
    )

    agg_subq = (
        select(
            ChatMessage.session_id,
            func.count(ChatMessage.id).label("cnt"),
            func.max(ChatMessage.created_at).label("last_activity"),
        )
        .where(ChatMessage.user_id == current_user.id)
        .group_by(ChatMessage.session_id)
        .subquery()
    )

    result = await db.execute(
        select(
            ChatMessage.session_id,
            ChatMessage.content,
            ChatMessage.created_at,
            agg_subq.c.cnt,
            agg_subq.c.last_activity,
        )
        .join(first_msg_subq, ChatMessage.id == first_msg_subq.c.first_id)
        .join(agg_subq, ChatMessage.session_id == agg_subq.c.session_id)
        .order_by(agg_subq.c.last_activity.desc())
        .limit(20)
    )
    rows = result.all()

    return [
        ChatSessionPreview(
            session_id=row.session_id,
            preview=row.content[:120] + ("…" if len(row.content) > 120 else ""),
            started_at=row.created_at,
            message_count=row.cnt,
            last_activity=row.last_activity,
        )
        for row in rows
    ]


@router.post("/sessions/{session_id}/end")
async def end_chat_session(
    session_id: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    exists = await db.scalar(
        select(func.count(ChatMessage.id)).where(
            ChatMessage.session_id == session_id,
            ChatMessage.user_id == current_user.id,
        )
    )
    if not exists:
        raise HTTPException(status_code=404, detail="Session not found")

    background_tasks.add_task(generate_insights, session_id, current_user.id)
    return {"session_id": session_id, "status": "insight generation queued"}
