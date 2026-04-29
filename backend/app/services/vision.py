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


_VISION_SYSTEM = """You are an expert visual thinking assistant. Break this project into clear, logical steps as a spatial mind map.

RULES — read carefully before generating:
1. Each step must be specific and actionable, not vague.
2. Steps must be in correct logical order — what must happen first comes first.
3. If the task involves a sequence (counting, listing, ordering), get every item exactly right. Do not skip, repeat, or mis-order items.
4. Double-check your output before responding. If a step is out of order or doesn't make sense, fix it first.
5. Keep step titles short: 3–8 words. Descriptions can be 1–2 sentences, specific to the student's content.

SPATIAL LAYOUT:
- 6 to 12 nodes total
- Arrange left-to-right by phase: starting steps x=100–300, middle steps x=400–800, final steps x=900–1200
- y ranges 80–580; spread nodes so they don't overlap (nodes are ~180×52px — keep 200px horizontal gap, 100px vertical gap)
- Group related nodes at similar y values

Return ONLY valid JSON with no commentary:
{
  "nodes": [
    {"title": "Short title", "description": "One specific sentence.", "x": 100, "y": 250}
  ],
  "connections": [
    {"from_index": 0, "to_index": 1}
  ]
}

Additional rules:
- from_index and to_index are 0-based indices into the nodes array
- A node may have at most one parent connection (one connection pointing to it)"""


_BREAKDOWN_SYSTEM = """You are a study planner. Break one task into 2–4 smaller, concrete sub-tasks.

RULES — read carefully before generating:
1. Each sub-task must be a concrete, actionable step — not a restatement of the parent task.
2. Sub-tasks must be in correct logical order (what comes first goes first).
3. Verify your output is accurate and correctly ordered before responding.
4. 2 to 4 sub-tasks only.
5. Descriptions are optional but preferred; keep them to one sentence.

Return ONLY valid JSON:
{
  "subtasks": [
    {"title": "Sub-task title", "description": "What specifically to do"}
  ]
}"""


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
