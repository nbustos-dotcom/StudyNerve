"""
Vision Board "Make Sense" AI service.

Three modes:
  breakdown — given a board title, generate 5-8 concrete actionable steps.
  expand    — given a step title + description, generate 3-4 sub-steps.
  analyze   — legacy canvas analysis (ask / cluster / expand).
"""

import json
from typing import Optional

from app.llm import generate_json

_MAX_SUMMARY_CHARS = 2000

_SYSTEM_BREAKDOWN = """You are a study planning AI. The student gives you a topic, assignment, or project.
Break it down into 5-8 concrete, actionable steps they can actually complete.
Order them logically. Be specific — avoid vague steps like "study" or "research".

Respond ONLY with valid JSON. No markdown fences, no commentary outside the JSON.
Keep title under 60 characters. Description under 120 characters.

{
  "action": "breakdown",
  "items": [
    {"type": "step", "title": "...", "description": "..."}
  ],
  "explanation": "One sentence summarizing the plan"
}"""

_SYSTEM_EXPAND = """You are a study planning AI. The student gives you one step from their plan.
Break it into 3-4 specific sub-tasks, each completable in one focused sitting.
Make each sub-task concrete and immediately actionable.

Respond ONLY with valid JSON. No markdown fences, no commentary outside the JSON.
Keep title under 60 characters. Description under 120 characters.

{
  "action": "expand",
  "items": [
    {"type": "step", "title": "...", "description": "..."}
  ],
  "explanation": "One sentence about these sub-tasks"
}"""

_SYSTEM_ANALYZE = """You are an AI thinking partner inside a study whiteboard called Brainspace.
The user shows you their canvas. Decide ONE of three actions:

ASK: if the canvas is empty or sparse (fewer than 2 stickies), ask one focused question
     and add 3 starter stickies as possible answers or starting points.

CLUSTER: if the canvas is messy (2+ stickies but no arrows connecting them),
         group related stickies under suggested theme labels — add one header sticky
         above each cluster (e.g. "📌 Core Concepts", "📌 Open Questions").

EXPAND: if the canvas is organized (stickies with arrows connecting them),
        suggest 2-3 deeper questions or related concepts as new stickies placed
        near existing ones to push thinking further.

Respond ONLY with valid JSON. No markdown fences, no commentary outside the JSON.
Keep sticky text under 80 characters. Position new stickies in empty canvas regions.

{
  "action": "ask" | "cluster" | "expand",
  "items": [
    {"type": "sticky", "text": "...", "x": 100, "y": 200}
  ],
  "explanation": "One sentence: what you saw and what you are doing"
}"""


# ── tldraw state parser (legacy) ──────────────────────────────────────────────

def _prosemirror_text(node: dict) -> str:
    """Recursively extract plain text from a ProseMirror JSON node."""
    if not isinstance(node, dict):
        return ""
    if node.get("type") == "text":
        return node.get("text", "")
    parts: list[str] = []
    for child in node.get("content") or []:
        parts.append(_prosemirror_text(child))
        if child.get("type") in ("paragraph", "heading", "blockquote"):
            parts.append("\n")
    return "".join(parts)


def _note_text(props: dict) -> str:
    """Extract plain text from a note shape's props (richText or legacy text)."""
    if isinstance(props.get("text"), str):
        return props["text"]
    rich = props.get("richText")
    if rich:
        return _prosemirror_text(rich).strip()
    return ""


def _classify_canvas(tldraw_state_json: str) -> tuple[str, str]:
    """
    Parse a tldraw snapshot JSON and return (canvas_state, summary_text).
    canvas_state: "empty" | "messy" | "organized"
    """
    try:
        snap = json.loads(tldraw_state_json)
    except (json.JSONDecodeError, TypeError, ValueError):
        return "empty", "Canvas is empty."

    try:
        store: dict = snap.get("document", snap).get("store", {})
    except AttributeError:
        return "empty", "Canvas is empty."

    stickies: list[dict] = []
    bound_arrows = 0
    draw_count = 0

    for record in store.values():
        if not isinstance(record, dict):
            continue
        if record.get("typeName") != "shape":
            continue

        shape_type = record.get("type", "")
        props = record.get("props") or {}
        x = float(record.get("x", 0))
        y = float(record.get("y", 0))

        if shape_type == "note":
            stickies.append({"text": _note_text(props), "x": x, "y": y})
        elif shape_type == "arrow":
            start_bound = (props.get("start") or {}).get("type") == "binding"
            end_bound = (props.get("end") or {}).get("type") == "binding"
            if start_bound and end_bound:
                bound_arrows += 1
        elif shape_type == "draw":
            draw_count += 1

    n = len(stickies)
    if n < 2:
        state = "empty"
    elif bound_arrows >= 1:
        state = "organized"
    else:
        state = "messy"

    lines = [f"Canvas state: {state}", f"Stickies ({n}):"]
    for s in stickies:
        text = (s["text"] or "(empty)").replace("\n", " ")[:100]
        lines.append(f"  • [{int(s['x'])}, {int(s['y'])}] {text}")
    if bound_arrows:
        lines.append(f"Shape-to-shape arrows: {bound_arrows}")
    if draw_count:
        lines.append(f"Freehand strokes: {draw_count}")

    summary = "\n".join(lines)
    if len(summary) > _MAX_SUMMARY_CHARS:
        summary = summary[:_MAX_SUMMARY_CHARS].rsplit("\n", 1)[0] + "\n[…truncated]"

    return state, summary


# ── Public API ────────────────────────────────────────────────────────────────

async def make_sense(
    tldraw_state: str = "",
    context_hint: str = "",
    provider_name: Optional[str] = None,
    api_key: Optional[str] = None,
    mode: Optional[str] = None,
    board_title: Optional[str] = None,
    step_title: Optional[str] = None,
    step_description: Optional[str] = None,
) -> Optional[dict]:
    """
    Analyze a board and return one AI action.

    mode="breakdown": generate 5-8 steps from board_title.
    mode="expand": generate 3-4 sub-steps from step_title + step_description.
    mode=None: legacy canvas analysis (ask / cluster / expand).
    """
    if mode == "breakdown":
        if not board_title:
            return None
        prompt = (
            f"Break down this study task into 5-8 concrete, actionable steps:\n\n"
            f"**{board_title}**\n\n"
            "Generate specific steps a student can follow. Order them logically. "
            "Include a brief description for each step explaining what to do."
        )
        system = _SYSTEM_BREAKDOWN
        if context_hint:
            system += f"\n\n## Student Background\n{context_hint}"
        return await generate_json(prompt, system, provider_name, api_key)

    if mode == "expand":
        if not step_title:
            return None
        desc_part = f"\nDescription: {step_description}" if step_description else ""
        prompt = (
            f"Expand this step into 3-4 specific sub-tasks:\n\n"
            f"**{step_title}**{desc_part}\n\n"
            "Each sub-task should be completable in one focused sitting."
        )
        system = _SYSTEM_EXPAND
        if context_hint:
            system += f"\n\n## Student Background\n{context_hint}"
        return await generate_json(prompt, system, provider_name, api_key)

    # Legacy canvas analysis
    canvas_state, summary = _classify_canvas(tldraw_state)
    prompt = (
        f"Here is the student's canvas:\n\n"
        f"{summary}\n\n"
        f"Canvas state classification: **{canvas_state}**\n\n"
        "Based on what you see, apply the appropriate action (ASK / CLUSTER / EXPAND). "
        "Place new stickies in areas that do not already have content."
    )
    system = _SYSTEM_ANALYZE
    if context_hint:
        system += f"\n\n## Student Background\n{context_hint}"
    return await generate_json(prompt, system, provider_name, api_key)
