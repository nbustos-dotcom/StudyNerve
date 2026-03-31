import json
import logging
from typing import Optional

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

_client: Optional[httpx.AsyncClient] = None


def get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(
            base_url=settings.OLLAMA_BASE_URL,
            timeout=httpx.Timeout(120.0),
        )
    return _client


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


# ── Core generation function ──────────────────────────────────────────────────

async def generate_json(prompt: str, system: str) -> Optional[dict]:
    """POST to Ollama /api/generate and return parsed JSON. Retries on parse failure."""
    client = get_client()
    payload = {
        "model": settings.OLLAMA_MODEL,
        "prompt": prompt,
        "system": system,
        "format": "json",
        "stream": False,
        "options": {
            "temperature": 0.7,
            "num_predict": 2048,
        },
    }

    for attempt in range(1, settings.MAX_LLM_RETRIES + 1):
        try:
            response = await client.post("/api/generate", json=payload)
            response.raise_for_status()
            raw = response.json().get("response", "")
            return json.loads(raw)
        except httpx.ConnectError:
            logger.error("Ollama unreachable at %s", settings.OLLAMA_BASE_URL)
            return None
        except httpx.HTTPStatusError as exc:
            logger.error("Ollama HTTP error: %s", exc)
            return None
        except (json.JSONDecodeError, ValueError) as exc:
            logger.warning(
                "JSON parse failure on attempt %d/%d: %s",
                attempt,
                settings.MAX_LLM_RETRIES,
                exc,
            )
            if attempt == settings.MAX_LLM_RETRIES:
                logger.error("All %d retries exhausted — giving up", settings.MAX_LLM_RETRIES)
                return None

    return None


# ── Health check ─────────────────────────────────────────────────────────────

async def check_health() -> dict:
    """Check if Ollama is reachable and the configured model is available."""
    client = get_client()
    try:
        response = await client.get("/api/tags")
        response.raise_for_status()
        data = response.json()
        available_models = [m["name"] for m in data.get("models", [])]
        model_available = any(
            settings.OLLAMA_MODEL in name for name in available_models
        )
        return {
            "ollama_reachable": True,
            "model": settings.OLLAMA_MODEL,
            "model_available": model_available,
            "available_models": available_models,
        }
    except httpx.ConnectError:
        logger.warning("Health check failed: Ollama unreachable")
        return {
            "ollama_reachable": False,
            "model": settings.OLLAMA_MODEL,
            "model_available": False,
            "available_models": [],
        }
    except Exception as exc:
        logger.error("Health check error: %s", exc)
        return {
            "ollama_reachable": False,
            "model": settings.OLLAMA_MODEL,
            "model_available": False,
            "available_models": [],
        }


# ── Convenience functions ─────────────────────────────────────────────────────

async def extract_topics(note_content: str) -> Optional[dict]:
    prompt = f"Extract the topics and subtopics from the following note:\n\n{note_content}"
    return await generate_json(prompt, TOPIC_EXTRACTION_SYSTEM)


async def generate_questions(
    note_content: str,
    topic_name: str,
    count: int,
    question_type: str,
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
    return await generate_json(prompt, QUESTION_GENERATION_SYSTEM)


async def evaluate_teaching(
    topic_name: str,
    student_explanation: str,
    note_content: Optional[str] = None,
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
    return await generate_json(prompt, TEACH_BACK_EVALUATION_SYSTEM)


async def evaluate_answer(
    question: str,
    correct_answer: str,
    student_answer: str,
) -> Optional[dict]:
    prompt = (
        f"Question: {question}\n"
        f"Correct answer: {correct_answer}\n"
        f"Student's answer: {student_answer}\n\n"
        "Evaluate whether the student's answer is correct."
    )
    return await generate_json(prompt, ANSWER_EVALUATION_SYSTEM)


async def generate_chat(messages: list[dict], system: str) -> Optional[str]:
    """
    POST to Ollama /api/chat with conversation history.
    Does NOT use JSON mode — returns the assistant's plain text reply.

    `messages` is a list of {"role": "user"|"assistant", "content": "..."} dicts
    in chronological order. The system prompt is prepended automatically.
    """
    client = get_client()
    payload = {
        "model": settings.OLLAMA_MODEL,
        "messages": [{"role": "system", "content": system}] + messages,
        "stream": False,
        "options": {
            "temperature": 0.7,
            "num_predict": 1024,
        },
    }
    try:
        response = await client.post("/api/chat", json=payload)
        response.raise_for_status()
        return response.json()["message"]["content"]
    except httpx.ConnectError:
        logger.error("Ollama unreachable at %s", settings.OLLAMA_BASE_URL)
        return None
    except httpx.HTTPStatusError as exc:
        logger.error("Ollama HTTP error: %s", exc)
        return None
    except (KeyError, ValueError) as exc:
        logger.error("Chat response parse error: %s", exc)
        return None
