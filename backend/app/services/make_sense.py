"""
Brainspace "Make Sense" AI service.

Parses a tldraw snapshot, classifies the canvas state, and asks the
LLM for one focused action (ask / cluster / expand).
"""

import json
from typing import Optional

from app.llm import generate_json

_MAX_SUMMARY_CHARS = 2000

_SYSTEM = """You are an AI thinking partner inside a study whiteboard called Brainspace.
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


# ── tldraw state parser ───────────────────────────────────────────────────────

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
    Parse a tldraw snapshot JSON and return:
      (canvas_state, summary_text)

    canvas_state: "empty" | "messy" | "organized"
    summary_text: human-readable description for the LLM prompt (≤ _MAX_SUMMARY_CHARS)
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

    lines = [
        f"Canvas state: {state}",
        f"Stickies ({n}):",
    ]
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
    tldraw_state: str,
    context_hint: str = "",
    provider_name: Optional[str] = None,
    api_key: Optional[str] = None,
) -> Optional[dict]:
    """
    Analyze a tldraw canvas snapshot and return one AI action.

    Returns {"action": str, "items": [...], "explanation": str}, or None on failure.
    """
    canvas_state, summary = _classify_canvas(tldraw_state)

    prompt = (
        f"Here is the student's canvas:\n\n"
        f"{summary}\n\n"
        f"Canvas state classification: **{canvas_state}**\n\n"
        "Based on what you see, apply the appropriate action (ASK / CLUSTER / EXPAND). "
        "Place new stickies in areas that do not already have content."
    )

    system = _SYSTEM
    if context_hint:
        system = system + f"\n\n## Student Background\n{context_hint}"

    return await generate_json(prompt, system, provider_name, api_key)
