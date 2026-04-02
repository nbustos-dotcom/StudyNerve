import logging
from typing import Optional

import httpx

from app.config import settings
from app.providers.router import get_provider

logger = logging.getLogger(__name__)


# ── Prompt templates ─────────────────────────────────────────────────────────

TOPIC_EXTRACTION_SYSTEM = """You are an expert educator. Given a note or text, extract the main topics and subtopics.
Return ONLY valid JSON in this exact structure:
{
  "topics": [
    {
      "name": "Topic Name",
      "subject": "optional broad subject area",
      "subtopics": ["Subtopic A", "Subtopic B"]
    }
  ]
}
Be concise. Extract only meaningful academic topics, not headings or meta-information."""

QUESTION_GENERATION_SYSTEM = """You are an expert quiz creator. Given a topic and source content, generate educational questions.
Return ONLY valid JSON in this exact structure:
{
  "questions": [
    {
      "type": "mcq",
      "content": "Question text here?",
      "options": {"A": "...", "B": "...", "C": "...", "D": "..."},
      "correct_answer": "A",
      "explanation": "Why A is correct...",
      "difficulty": 3
    },
    {
      "type": "short_answer",
      "content": "Question text here?",
      "options": null,
      "correct_answer": "Expected answer...",
      "explanation": "Key points that make an answer correct...",
      "difficulty": 2
    }
  ]
}
MCQ questions must have exactly 4 options (A, B, C, D). Difficulty is 1 (easiest) to 5 (hardest)."""

ANSWER_EVALUATION_SYSTEM = """You are a fair and constructive teacher evaluating a student's answer.
Return ONLY valid JSON in this exact structure:
{
  "is_correct": true,
  "feedback": "Brief, encouraging feedback explaining why the answer is correct or what was missed."
}
Be lenient with wording — mark correct if the student demonstrates understanding of the concept,
even if not word-for-word. For MCQ, only mark correct if the letter or text matches exactly."""

INSIGHT_EXTRACTION_SYSTEM = """You are analyzing a tutoring conversation to extract key observations about the student.
Return ONLY valid JSON in this exact structure:
{
  "insights": [
    {
      "insight": "Specific, actionable observation about this student",
      "category": "misconception",
      "topic_name": "The concept this relates to, or null if general"
    }
  ]
}
Categories must be one of: "learning_pattern", "misconception", "preference", "strength"
Rules:
- Extract 1-3 insights maximum — quality over quantity
- Be specific: name the actual concept, behaviour, or pattern observed
- topic_name should name the specific concept (e.g. "recursion", "mitosis") or null for general observations
- Only report genuine, evidence-based observations from the conversation — no guessing
- "misconception": student stated or implied something factually wrong
- "strength": student demonstrated clear understanding of something
- "preference": student expressed how they like to learn
- "learning_pattern": recurring behaviour (e.g. skips steps, needs examples first)"""

TEACH_BACK_EVALUATION_SYSTEM = """You are an expert educator evaluating a student's understanding of a topic through their own explanation.
Return ONLY valid JSON in this exact structure:
{
  "score": 7,
  "covered": ["key concept they explained correctly", "another concept they got right"],
  "missed": ["important concept they didn't mention", "another gap in their explanation"],
  "incorrect": ["specific thing they stated incorrectly or that was misleading"],
  "feedback": "Direct, specific written feedback. What they understood well. What needs work. One concrete suggestion."
}
Scoring: 1-3 = major gaps in understanding, 4-6 = partial grasp with notable gaps, 7-8 = solid understanding, 9-10 = excellent mastery.
Rules:
- Be specific in every list — name actual concepts, not vague descriptions like "some details were missing"
- The incorrect list is ONLY for genuinely wrong or misleading statements, not omissions (those go in missed)
- If the explanation is too short or vague to evaluate meaningfully, give score ≤ 3 and explain in feedback
- covered and missed lists together should account for the main concepts of the topic
- feedback should be 2-4 sentences maximum: direct, not soft"""


# ── Public interface ──────────────────────────────────────────────────────────

async def generate_json(
    prompt: str,
    system: str,
    provider_name: Optional[str] = None,
    api_key: Optional[str] = None,
) -> Optional[dict]:
    provider = get_provider(provider_name, api_key)
    return await provider.generate_json(prompt, system)


async def generate_chat(
    messages: list[dict],
    system: str,
    provider_name: Optional[str] = None,
    api_key: Optional[str] = None,
) -> Optional[str]:
    provider = get_provider(provider_name, api_key)
    return await provider.generate_chat(messages, system)


# ── Health check ─────────────────────────────────────────────────────────────

async def check_health() -> dict:
    provider_name = settings.LLM_PROVIDER

    if provider_name == "gemini":
        has_key = bool(settings.GEMINI_API_KEY)
        return {
            "provider": "gemini",
            "model": "gemini-2.0-flash",
            "api_key_set": has_key,
            "ready": has_key,
        }

    if provider_name == "openai":
        has_key = bool(settings.OPENAI_API_KEY)
        return {
            "provider": "openai",
            "model": "gpt-4o-mini",
            "api_key_set": has_key,
            "ready": has_key,
        }

    if provider_name == "anthropic":
        has_key = bool(settings.ANTHROPIC_API_KEY)
        return {
            "provider": "anthropic",
            "model": "claude-sonnet-4-20250514",
            "api_key_set": has_key,
            "ready": has_key,
        }

    # Ollama health check
    try:
        async with httpx.AsyncClient(
            base_url=settings.OLLAMA_BASE_URL, timeout=httpx.Timeout(10.0)
        ) as client:
            response = await client.get("/api/tags")
            response.raise_for_status()
            data = response.json()
            available_models = [m["name"] for m in data.get("models", [])]
            model_available = any(
                settings.OLLAMA_MODEL in name for name in available_models
            )
            return {
                "provider": "ollama",
                "ollama_reachable": True,
                "model": settings.OLLAMA_MODEL,
                "model_available": model_available,
                "available_models": available_models,
            }
    except httpx.ConnectError:
        logger.warning("Health check failed: Ollama unreachable")
        return {
            "provider": "ollama",
            "ollama_reachable": False,
            "model": settings.OLLAMA_MODEL,
            "model_available": False,
            "available_models": [],
        }
    except Exception as exc:
        logger.error("Health check error: %s", exc)
        return {
            "provider": "ollama",
            "ollama_reachable": False,
            "model": settings.OLLAMA_MODEL,
            "model_available": False,
            "available_models": [],
        }


# ── Convenience functions ─────────────────────────────────────────────────────

async def extract_topics(
    note_content: str,
    provider_name: Optional[str] = None,
    api_key: Optional[str] = None,
) -> Optional[dict]:
    prompt = f"Extract the topics and subtopics from the following note:\n\n{note_content}"
    return await generate_json(prompt, TOPIC_EXTRACTION_SYSTEM, provider_name, api_key)


async def generate_questions(
    note_content: str,
    topic_name: str,
    count: int,
    question_type: str,
    provider_name: Optional[str] = None,
    api_key: Optional[str] = None,
) -> Optional[dict]:
    type_instruction = (
        "Generate only multiple-choice (MCQ) questions."
        if question_type == "mcq"
        else "Generate only short-answer questions."
        if question_type == "short_answer"
        else "Generate a mix of MCQ and short-answer questions."
    )
    prompt = (
        f"Topic: {topic_name}\n\n"
        f"Source content:\n{note_content}\n\n"
        f"Generate exactly {count} questions about this topic. {type_instruction}"
    )
    return await generate_json(prompt, QUESTION_GENERATION_SYSTEM, provider_name, api_key)


async def extract_insights(
    messages: list[dict],
    provider_name: Optional[str] = None,
    api_key: Optional[str] = None,
) -> Optional[dict]:
    conversation = "\n".join(
        f"{m['role'].upper()}: {m['content']}" for m in messages
    )
    prompt = f"Tutoring conversation to analyse:\n\n{conversation}"
    return await generate_json(prompt, INSIGHT_EXTRACTION_SYSTEM, provider_name, api_key)


async def evaluate_teaching(
    topic_name: str,
    student_explanation: str,
    note_content: Optional[str] = None,
    provider_name: Optional[str] = None,
    api_key: Optional[str] = None,
) -> Optional[dict]:
    context = ""
    if note_content:
        truncated = note_content[:2000]
        context = f"\n\nReference material for this topic:\n{truncated}"

    prompt = (
        f"Topic: {topic_name}{context}\n\n"
        f"Student's explanation:\n{student_explanation}\n\n"
        "Evaluate this explanation against the topic and reference material."
    )
    return await generate_json(prompt, TEACH_BACK_EVALUATION_SYSTEM, provider_name, api_key)


async def evaluate_answer(
    question: str,
    correct_answer: str,
    student_answer: str,
    provider_name: Optional[str] = None,
    api_key: Optional[str] = None,
) -> Optional[dict]:
    prompt = (
        f"Question: {question}\n"
        f"Correct answer: {correct_answer}\n"
        f"Student's answer: {student_answer}\n\n"
        "Evaluate whether the student's answer is correct."
    )
    return await generate_json(prompt, ANSWER_EVALUATION_SYSTEM, provider_name, api_key)
