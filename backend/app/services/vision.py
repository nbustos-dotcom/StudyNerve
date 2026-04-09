"""
Vision Board AI service.

Functions:
  ai_organize   — ask LLM to suggest an ordering and grouping of board nodes
  ai_breakdown  — ask LLM to break one node into 2-4 sub-tasks
  ai_ask        — short tutor answer about a node with board context
"""

from typing import Optional

from app.llm import generate_chat, generate_json

_MAX_CHARS = 3000  # truncation guard

# ── System prompts ────────────────────────────────────────────────────────────

_ORGANIZE_SYSTEM = """You are a study planner helping a student organize their whiteboard ideas.
Given a list of tasks/ideas, suggest a logical order to complete them, group related items,
and identify any important steps that are missing.

Return ONLY valid JSON in this exact structure:
{
  "reordered": [
    {"id": 1, "suggested_order": 0, "group_name": "Research"}
  ],
  "missing_steps": [
    {"title": "Step title", "description": "What to do", "connect_after_id": 2}
  ]
}

Rules:
- suggested_order is 0-based; every input node must appear in reordered
- group_name clusters related steps (e.g. "Research", "Writing", "Review"); use null if no obvious group
- missing_steps lists genuinely important steps that are absent — max 3
- connect_after_id is the id of the existing node the missing step should follow, or null
- Be specific to the student's actual content — no generic advice"""


_VISION_SYSTEM = """You are an expert visual thinking assistant. A student described a project or assignment. Create a spatial mind map layout for it.

Break it into 6 to 12 main nodes with clear, short titles. For each node include a brief 1-sentence description.

Arrange them so the flow reads left to right:
- Starting steps get LOW x values (100-300)
- Middle steps get MID x values (400-800)
- Final steps get HIGH x values (900-1200)
- Group related nodes vertically with similar y values
- Spread nodes out so they do not overlap (each node is ~180px wide, ~52px tall — keep at least 200px horizontal gap and 100px vertical gap)

Return ONLY valid JSON with no commentary:
{
  "nodes": [
    {"title": "Short title", "description": "One sentence about what this involves.", "x": 100, "y": 250}
  ],
  "connections": [
    {"from_index": 0, "to_index": 1}
  ]
}

Rules:
- 6 to 12 nodes exactly
- x ranges 100 to 1200, y ranges 80 to 580
- connections show logical flow or dependency (from_index → to_index)
- from_index and to_index are 0-based indices into the nodes array
- A node may have at most one parent connection (one connection pointing to it)
- titles must be 2 to 5 words — concise
- descriptions must be a single sentence — specific to the student's content"""


_BREAKDOWN_SYSTEM = """You are a study planner. Break one task into 2-4 concrete, actionable sub-tasks.

Return ONLY valid JSON in this exact structure:
{
  "subtasks": [
    {"title": "Sub-task title", "description": "What specifically to do"}
  ]
}

Rules:
- 2 to 4 sub-tasks only
- Each sub-task must be specific and actionable — not vague
- description is optional but preferred; keep it to one sentence
- Do not re-state the parent task as a sub-task"""


# ── Public API ────────────────────────────────────────────────────────────────

async def ai_vision(
    description: str,
    provider_name: Optional[str] = None,
    api_key: Optional[str] = None,
) -> Optional[dict]:
    """
    Given a free-form project description, return a spatial mind map layout.
    Returns {nodes: [{title, description, x, y}], connections: [{from_index, to_index}]}.
    """
    prompt = (
        f"The student described their project or assignment:\n\n"
        f"{description[:2000].strip()}\n\n"
        "Create a visual mind map layout for this. "
        "Think carefully about the logical flow and what steps depend on each other."
    )
    return await generate_json(prompt, _VISION_SYSTEM, provider_name, api_key)

async def ai_organize(
    nodes: list[dict],
    provider_name: Optional[str] = None,
    api_key: Optional[str] = None,
) -> Optional[dict]:
    """
    Ask the LLM to suggest a logical ordering and grouping for the given nodes.
    Returns the raw parsed JSON dict {reordered, missing_steps}, or None on failure.
    """
    lines = ["The student has these ideas on a whiteboard:"]
    for n in nodes:
        desc = f" — {n['description'][:80]}" if n.get("description") else ""
        lines.append(f"  ID {n['id']}: {n['title']}{desc}")

    prompt = "\n".join(lines) + "\n\nSuggest a logical order to complete them. Group related items. Add any missing steps."
    return await generate_json(prompt, _ORGANIZE_SYSTEM, provider_name, api_key)


async def ai_breakdown(
    title: str,
    description: Optional[str],
    provider_name: Optional[str] = None,
    api_key: Optional[str] = None,
) -> Optional[dict]:
    """
    Ask the LLM to break a single node into 2-4 sub-tasks.
    Returns {subtasks: [{title, description}]}, or None on failure.
    """
    desc_part = f"\nDescription: {description[:200]}" if description else ""
    prompt = f"Task: {title}{desc_part}\n\nBreak this task into 2-4 smaller sub-tasks."
    return await generate_json(prompt, _BREAKDOWN_SYSTEM, provider_name, api_key)


async def ai_ask(
    question: str,
    board_title: str,
    nodes: list[dict],
    provider_name: Optional[str] = None,
    api_key: Optional[str] = None,
) -> Optional[str]:
    """
    Answer a student's question about a specific node, with board context.
    Returns the assistant's reply string, or None on failure.
    """
    node_lines = []
    for n in nodes:
        done = "[done]" if n.get("is_completed") else "[ ]"
        node_lines.append(f"  {done} {n['title']}")

    system = (
        "You are StudyNerve AI — a direct, helpful tutor. "
        "A student is asking about one step in their assignment plan.\n\n"
        f"ASSIGNMENT: {board_title}\n\n"
        "ALL STEPS ON THEIR BOARD:\n" + "\n".join(node_lines) + "\n\n"
        "Rules:\n"
        "- Answer in 2-4 sentences max\n"
        "- Be specific to this assignment\n"
        "- No filler phrases like 'Great question'\n"
        "- End with one targeted follow-up question"
    )
    return await generate_chat(
        [{"role": "user", "content": question}],
        system,
        provider_name,
        api_key,
    )
