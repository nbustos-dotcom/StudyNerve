"""
Vision Board service.

Handles LLM-powered step generation and progress calculation.
"""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.llm import generate_json
from app.models import VisionStep


# ── System prompt ─────────────────────────────────────────────────────────────

_BREAKDOWN_SYSTEM = """Break this assignment into a logical sequence of steps.
For complex steps, include sub-steps. Return ONLY valid JSON in this exact structure:
{
  "steps": [
    {
      "title": "Step title",
      "description": "What to do and why — be specific to this assignment",
      "estimated_minutes": 30,
      "substeps": [
        {
          "title": "Sub-step title",
          "description": "Specific action",
          "estimated_minutes": 10
        }
      ]
    }
  ]
}
Rules:
- Order steps logically — what must be done first comes first
- Be specific to THIS assignment, not generic ("Read the prompt" is not useful)
- Each step should be a concrete, actionable task
- Use substeps only when a step is genuinely complex (3-6 substeps max)
- estimated_minutes should be realistic; substep minutes should sum to roughly the parent's
- substeps array must be present but can be empty []
- Aim for 4-8 top-level steps total"""


# ── Public API ────────────────────────────────────────────────────────────────

async def generate_breakdown(
    title: str,
    description: str,
    note_content: str | None = None,
) -> dict | None:
    """
    Ask Ollama to break an assignment into ordered steps (with optional sub-steps).
    Returns the raw parsed JSON dict, or None if the LLM is unavailable.
    """
    parts = [f"Assignment: {title}"]

    if description.strip():
        parts.append(f"\nDescription:\n{description.strip()}")

    if note_content and note_content.strip():
        truncated = note_content.strip()[:2000]
        parts.append(f"\nAdditional context from notes:\n{truncated}")

    prompt = "\n".join(parts)
    return await generate_json(prompt, _BREAKDOWN_SYSTEM)


async def calculate_progress(board_id: int, db: AsyncSession) -> int:
    """
    Compute completed-steps / total-steps as an integer percentage 0–100.
    All steps (top-level and sub-steps) are counted equally.
    Returns 0 if the board has no steps.
    """
    total = await db.scalar(
        select(func.count(VisionStep.id)).where(VisionStep.board_id == board_id)
    )
    if not total:
        return 0

    completed = await db.scalar(
        select(func.count(VisionStep.id)).where(
            VisionStep.board_id == board_id,
            VisionStep.is_completed == True,  # noqa: E712
        )
    )
    return round(((completed or 0) / total) * 100)
