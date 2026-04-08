"""
Vision Board service.

Handles LLM-powered step generation, progress calculation,
snapshot management, and context-update restructuring.
"""

import json

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.llm import generate_json
from app.models import VisionBoardSnapshot, VisionStep


# ── System prompt — initial breakdown ─────────────────────────────────────────

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


# ── System prompt — context update ────────────────────────────────────────────

_UPDATE_CONTEXT_SYSTEM = """A student's project plan has changed. Based on their update, restructure the plan.

You will receive:
- The current step list with IDs, titles, descriptions, and completion status
- A free-text description of what changed

You can:
- Add new steps (provide title, description, parent_step_id [null for root], order_index)
- Remove steps that are no longer relevant (provide their IDs)
- Modify existing step titles or descriptions (provide the step ID and new values)
- Reorder steps (provide step ID and new order_index)

Return ONLY valid JSON in this exact structure:
{
  "added": [
    {
      "title": "Step title",
      "description": "What to do",
      "parent_step_id": null,
      "order_index": 5,
      "estimated_minutes": 30
    }
  ],
  "removed_step_ids": [],
  "modified": [
    {
      "id": 3,
      "title": "Updated title",
      "description": "Updated description"
    }
  ],
  "reordered": [
    {
      "id": 2,
      "new_order_index": 0
    }
  ]
}

Rules:
- Never remove completed steps unless the student explicitly says to remove them
- Keep changes minimal and targeted — only restructure what the update actually affects
- parent_step_id in added items must be null or a valid existing step ID from the current list
- estimated_minutes is optional in added items
- title and description in modified items are both optional (only include fields that change)"""


# ── Public API ────────────────────────────────────────────────────────────────

async def generate_breakdown(
    title: str,
    description: str,
    note_content: str | None = None,
    provider_name: str | None = None,
    api_key: str | None = None,
) -> dict | None:
    """
    Ask the LLM to break an assignment into ordered steps (with optional sub-steps).
    Returns the raw parsed JSON dict, or None if the LLM is unavailable.
    """
    parts = [f"Assignment: {title}"]

    if description.strip():
        parts.append(f"\nDescription:\n{description.strip()}")

    if note_content and note_content.strip():
        truncated = note_content.strip()[:3000]
        parts.append(f"\nAdditional context from notes:\n{truncated}")

    prompt = "\n".join(parts)
    return await generate_json(prompt, _BREAKDOWN_SYSTEM, provider_name, api_key)


async def generate_context_update(
    flat_steps: list[VisionStep],
    update_text: str,
    provider_name: str | None = None,
    api_key: str | None = None,
) -> dict | None:
    """
    Send the current board state + student's update text to the LLM.
    Returns a restructure plan dict with added/removed_step_ids/modified/reordered,
    or None if the LLM is unavailable.
    """
    step_lines: list[str] = ["Current steps (use these IDs when referencing existing steps):"]
    for s in flat_steps:
        indent = "    " if s.parent_step_id else ""
        done = "[done]" if s.is_completed else "[not done]"
        parent_note = f" (child of step {s.parent_step_id})" if s.parent_step_id else ""
        desc = f" — {s.description[:80]}" if s.description else ""
        step_lines.append(
            f"{indent}ID {s.id}: {s.title}{desc} | order {s.order_index}{parent_note} {done}"
        )

    prompt = "\n".join(step_lines) + f"\n\nStudent's update: {update_text}"
    return await generate_json(prompt, _UPDATE_CONTEXT_SYSTEM, provider_name, api_key)


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


async def save_snapshot(
    board_id: int,
    action_description: str,
    db: AsyncSession,
) -> None:
    """
    Serialize all current steps for board_id to JSON and save as a snapshot.
    Prunes oldest snapshots beyond 20 per board.
    """
    result = await db.execute(
        select(VisionStep)
        .where(VisionStep.board_id == board_id)
        .order_by(VisionStep.order_index)
    )
    flat = list(result.scalars().all())

    data = json.dumps([
        {
            "id": s.id,
            "title": s.title,
            "description": s.description,
            "order_index": s.order_index,
            "parent_step_id": s.parent_step_id,
            "is_completed": s.is_completed,
            "estimated_minutes": s.estimated_minutes,
        }
        for s in flat
    ])

    db.add(VisionBoardSnapshot(
        board_id=board_id,
        snapshot_data=data,
        action_description=action_description,
    ))

    # Flush so the new snapshot is counted, then prune beyond 20
    await db.flush()
    prune_result = await db.execute(
        select(VisionBoardSnapshot.id)
        .where(VisionBoardSnapshot.board_id == board_id)
        .order_by(VisionBoardSnapshot.created_at.desc())
        .offset(20)
    )
    old_ids = prune_result.scalars().all()
    if old_ids:
        await db.execute(
            delete(VisionBoardSnapshot).where(VisionBoardSnapshot.id.in_(old_ids))
        )


async def restore_snapshot(
    board_id: int,
    db: AsyncSession,
) -> bool:
    """
    Restore the most recent snapshot for board_id.
    Deletes all current steps and recreates them from snapshot data.
    Returns True if a snapshot was found and restored, False otherwise.
    """
    snap_result = await db.execute(
        select(VisionBoardSnapshot)
        .where(VisionBoardSnapshot.board_id == board_id)
        .order_by(VisionBoardSnapshot.created_at.desc())
        .limit(1)
    )
    snapshot = snap_result.scalar_one_or_none()
    if snapshot is None:
        return False

    steps_data: list[dict] = json.loads(snapshot.snapshot_data)

    # Delete children first, then roots — explicit order avoids relying on
    # DB-level FK cascade (SQLite disables it by default without a pragma).
    await db.execute(
        delete(VisionStep).where(
            VisionStep.board_id == board_id,
            VisionStep.parent_step_id.is_not(None),
        )
    )
    await db.flush()
    await db.execute(
        delete(VisionStep).where(VisionStep.board_id == board_id)
    )
    await db.flush()

    # Recreate steps: roots first, then children (mapping old ID → new ID)
    old_to_new: dict[int, int] = {}

    roots = [s for s in steps_data if s["parent_step_id"] is None]
    children = [s for s in steps_data if s["parent_step_id"] is not None]

    for s in roots:
        new_step = VisionStep(
            board_id=board_id,
            title=s["title"],
            description=s["description"],
            order_index=s["order_index"],
            parent_step_id=None,
            is_completed=s["is_completed"],
            estimated_minutes=s["estimated_minutes"],
        )
        db.add(new_step)
        await db.flush()
        old_to_new[s["id"]] = new_step.id

    for s in children:
        new_parent_id = old_to_new.get(s["parent_step_id"])
        new_step = VisionStep(
            board_id=board_id,
            title=s["title"],
            description=s["description"],
            order_index=s["order_index"],
            parent_step_id=new_parent_id,
            is_completed=s["is_completed"],
            estimated_minutes=s["estimated_minutes"],
        )
        db.add(new_step)
        await db.flush()
        old_to_new[s["id"]] = new_step.id

    # Delete the snapshot that was just restored (it's consumed)
    await db.delete(snapshot)

    return True
