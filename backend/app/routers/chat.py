import re
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.llm import generate_chat
from app.models import ChatMessage, Note, Question
from app.schemas import (
    ChatMessageResponse,
    ChatSendRequest,
    ChatSendResponse,
    ChatSessionPreview,
)
from app.services.gap_detector import calculate_gap_scores

router = APIRouter(prefix="/chat", tags=["chat"])

# Maximum note content length sent to the LLM to avoid overflowing context
_NOTE_CONTENT_LIMIT = 3000
# Conversation turns loaded from history (each turn = 1 message)
_HISTORY_LIMIT = 10

# ── Communication style detection ─────────────────────────────────────────────

# Common internet/casual abbreviations and slang
_CASUAL_RE = re.compile(
    r'\b(idk|ngl|tbh|lol|lmao|omg|rn|imo|iirc|brb|btw|smh|fr|nah|yeah|yep|'
    r'gonna|wanna|kinda|sorta|cuz|bc|tho|wtf|haha|lmk|imo|fwiw|afaik|ig|'
    r'lowkey|highkey|literally|deadass|no cap|slay|vibe)\b',
    re.IGNORECASE,
)

# Domain-specific technical vocabulary across common subjects
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
    """
    Infer the student's communication style from their recent messages.
    Returns a short descriptor string that gets injected into the system prompt.

    Heuristics:
      - Casual:   slang/abbreviations present, OR very short average message length
      - Technical: multiple technical terms, OR long messages with dense punctuation
      - Neutral:  everything else
    """
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
    note_id: int | None,
    question_id: int | None,
    style_hint: str,
) -> str:
    """
    Compose the Master Teacher system prompt, injecting:
      - the student's detected communication style
      - the student's top-5 weak topics (from gap scores)
      - the note's content when note_id is supplied
      - the question + correct answer when question_id is supplied
    """
    lines: list[str] = [
        "You are Master Teacher — a sharp, confident, no-nonsense AI tutor who genuinely "
        "makes students understand things. You're not soft. You're direct, clear, and you "
        "break things down until there's zero confusion.",
        "",
        "HOW YOU EXPLAIN THINGS:",
        "- Never give one big paragraph. Break every explanation into numbered points or clear separated sections.",
        "- Each point should be ONE idea. Short. Clear. No fluff.",
        "- Start with the big picture in one sentence, THEN break it into pieces.",
        "- Use this structure when introducing a concept: What is it → Why does it matter → How does it work → Common mistakes.",
        "- Use **bold** for every key term the first time you introduce it.",
        "- Use analogies that actually land — compare abstract concepts to everyday things the student already understands.",
        "- When explaining steps or processes, number them. Every time.",
        "- After explaining, give a quick example that proves the concept works.",
        "- End important explanations with a one-line takeaway in **bold**.",
        "",
        "HOW YOU TALK:",
        "- Mirror how the student talks. If they use casual language, be casual. If they're formal, match that.",
        "- Pay attention to their vocabulary level — if they use simple words, don't hit them with jargon. If they use technical terms correctly, match their level.",
        "- Short sentences hit harder. Use them for key points.",
        "- Longer sentences are fine for context and examples.",
        "- Never say 'Great question!' or 'That's a great question!' — just answer it.",
        "- Don't over-praise. When they get something right, acknowledge it briefly: 'Exactly. Now here's where it gets interesting...'",
        "- When they're wrong, be straight: 'Not quite — here's where the thinking breaks down...' then fix it clearly.",
        "- Ask ONE focused follow-up question at the end, not multiple.",
        "",
        "HOW YOU ADAPT:",
        "- Track how the student phrases things across the conversation.",
        "- If they say 'idk' and 'ngl' — talk like a human, not a textbook.",
        "- If they write in full sentences with proper grammar — be more structured.",
        "- If they seem frustrated, slow down and simplify.",
        "- If they seem to be getting it, push them harder with deeper questions.",
        "",
        "You know this student's weak areas and study material. Reference their actual notes "
        "and gap data when relevant. Make every explanation land so hard they can't forget it.",
        "",
    ]

    # ── Detected style ────────────────────────────────────────────────────────
    lines.append(f"## Detected student communication style: {style_hint}")
    lines.append("")

    # ── Weak areas ────────────────────────────────────────────────────────────
    gaps = await calculate_gap_scores(db)
    if gaps:
        lines.append("## Student's Weak Areas (weave these into explanations where relevant):")
        for g in gaps[:5]:
            pct = round(g.accuracy * 100)
            lines.append(
                f"- **{g.topic_name}**: {pct}% accuracy over {g.total_attempts} "
                f"attempt{'s' if g.total_attempts != 1 else ''}"
            )
        lines.append("")

    # ── Note content ──────────────────────────────────────────────────────────
    if note_id is not None:
        note = await db.get(Note, note_id)
        if note:
            lines.append(f"## Study Material: {note.title}")
            content = note.content
            if len(content) > _NOTE_CONTENT_LIMIT:
                content = content[:_NOTE_CONTENT_LIMIT] + "\n[…content truncated…]"
            lines.append(content)
            lines.append("")

    # ── Question context ──────────────────────────────────────────────────────
    if question_id is not None:
        question = await db.get(Question, question_id)
        if question:
            lines.append("## Question the student got wrong (help them understand why):")
            lines.append(f"Question: {question.content}")
            lines.append(f"Correct answer: {question.correct_answer}")
            if question.explanation:
                lines.append(f"Explanation: {question.explanation}")
            lines.append("")

    return "\n".join(lines)


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/send", response_model=ChatSendResponse)
async def send_message(body: ChatSendRequest, db: AsyncSession = Depends(get_db)):
    session_id = body.session_id or str(uuid.uuid4())

    # Load last N messages from this session for context
    history_result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at.desc())
        .limit(_HISTORY_LIMIT)
    )
    history_rows = list(reversed(history_result.scalars().all()))
    history = [{"role": m.role, "content": m.content} for m in history_rows]

    # Detect communication style from recent user turns
    recent_user_msgs = [m.content for m in history_rows if m.role == "user"][-5:]
    style_hint = _detect_style(recent_user_msgs)

    # Build context-aware system prompt
    system = await _build_system_prompt(db, body.note_id, body.question_id, style_hint)

    # Append the new user message to history for the LLM call
    llm_messages = history + [{"role": "user", "content": body.message}]

    response_text = await generate_chat(llm_messages, system)
    if response_text is None:
        raise HTTPException(status_code=502, detail="Ollama unavailable or failed to respond")

    # Persist both turns
    db.add(ChatMessage(role="user", content=body.message, session_id=session_id))
    db.add(ChatMessage(role="assistant", content=response_text, session_id=session_id))
    await db.flush()

    return ChatSendResponse(session_id=session_id, response=response_text)


@router.get("/history/{session_id}", response_model=list[ChatMessageResponse])
async def get_history(session_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at)
    )
    return result.scalars().all()


@router.get("/sessions", response_model=list[ChatSessionPreview])
async def list_sessions(db: AsyncSession = Depends(get_db)):
    # Subquery: first message id per session (cheapest proxy for "preview")
    first_msg_subq = (
        select(
            ChatMessage.session_id,
            func.min(ChatMessage.id).label("first_id"),
        )
        .group_by(ChatMessage.session_id)
        .subquery()
    )

    # Subquery: message count per session
    count_subq = (
        select(
            ChatMessage.session_id,
            func.count(ChatMessage.id).label("cnt"),
        )
        .group_by(ChatMessage.session_id)
        .subquery()
    )

    result = await db.execute(
        select(
            ChatMessage.session_id,
            ChatMessage.content,
            ChatMessage.created_at,
            count_subq.c.cnt,
        )
        .join(first_msg_subq, ChatMessage.id == first_msg_subq.c.first_id)
        .join(count_subq, ChatMessage.session_id == count_subq.c.session_id)
        .order_by(ChatMessage.created_at.desc())
        .limit(20)
    )
    rows = result.all()

    return [
        ChatSessionPreview(
            session_id=row.session_id,
            preview=row.content[:120] + ("…" if len(row.content) > 120 else ""),
            started_at=row.created_at,
            message_count=row.cnt,
        )
        for row in rows
    ]
