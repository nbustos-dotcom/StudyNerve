"""
Workflow execution engine.

plan_workflow:    reads nodes for a board, asks the LLM for a JSON execution plan,
                  persists a WorkflowRun in "awaiting_confirmation" status.

execute_workflow: runs each WorkflowNode in order, chains outputs, persists results.
                  Designed to be called from a FastAPI BackgroundTask — creates its
                  own DB session so it outlives the HTTP request.

_run_workflow_bg: thin async wrapper that owns the session for background use.
"""

import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.crypto import decrypt_secret
from app.database import AsyncSessionLocal
from app.models import UserSettings, VisionBoard, WorkflowNode, WorkflowRun
from app.providers.router import get_provider

logger = logging.getLogger(__name__)

_TRUNCATE = 3000  # max chars of chained text fed into any provider call

# ── Planner ────────────────────────────────────────────────────────────────────

_PLANNER_SYSTEM = """You are a workflow execution planner for an AI-powered learning tool called StudyNerve.

Given an ordered list of AI processing nodes, you will:
1. Analyze each node's type, prompt, provider, and model
2. Determine what output each node will produce (text, image, or 3D asset)
3. Describe how each node's output feeds into the next node
4. Return a structured JSON execution plan

Supported node types and their default output:
- chatgpt_text       → text   (OpenAI ChatGPT)
- chatgpt_image      → image  (OpenAI DALL-E)
- claude_text        → text   (Anthropic Claude)
- gemini_text        → text   (Google Gemini)
- gemini_image       → image  (Google Gemini Imagen)
- meshy_3d           → 3d     (Meshy.ai)
- stability_image    → image  (Stability AI)
- internal_quiz      → text   (platform quiz engine)
- internal_flashcard → text   (platform flashcard engine)
- internal_summary   → text   (platform summarizer)

Return ONLY valid JSON — no markdown fences, no extra commentary. Shape:
{
  "summary": "<one sentence describing the full workflow>",
  "steps": [
    {
      "node_id": <int>,
      "node_order": <int>,
      "node_type": "<type>",
      "provider": "<provider string or null>",
      "model": "<model string or null>",
      "action": "<plain English: what this node will do>",
      "input_from_node_id": <int or null>,
      "expected_output_type": "text" | "image" | "3d",
      "chaining_note": "<how previous output feeds in, or 'First node — no upstream input'>"
    }
  ],
  "warnings": ["<any issues: missing keys, incompatible chaining, etc.>"]
}"""


def _build_node_prompt(nodes: list[WorkflowNode]) -> str:
    lines = ["Here are the workflow nodes in execution order:\n"]
    for node in nodes:
        lines.append(
            f"Node {node.node_order} (id={node.id})\n"
            f"  type:     {node.node_type}\n"
            f"  provider: {node.provider or 'not set'}\n"
            f"  model:    {node.model or 'not set'}\n"
            f"  prompt:   {node.prompt or '(empty)'}\n"
            f"  input_from_node_id: {node.input_from_node_id}\n"
        )
    lines.append("\nOutput a JSON execution plan for these nodes.")
    return "\n".join(lines)


async def plan_workflow(
    *,
    vision_board_id: int,
    user_id: int,
    db: AsyncSession,
    llm_kwargs: dict[str, Any],
) -> dict[str, Any]:
    """
    Fetch all WorkflowNodes for the board (user-scoped), send them to the LLM
    planner, persist a WorkflowRun, and return the plan dict.
    """
    board = await db.get(VisionBoard, vision_board_id)
    if not board or board.user_id != user_id:
        raise ValueError("Vision board not found.")

    result = await db.execute(
        select(WorkflowNode)
        .where(
            WorkflowNode.vision_board_id == vision_board_id,
            WorkflowNode.user_id == user_id,
        )
        .order_by(WorkflowNode.node_order)
    )
    nodes: list[WorkflowNode] = list(result.scalars().all())

    if not nodes:
        raise ValueError("No workflow nodes found for this board.")

    provider = get_provider(**llm_kwargs)
    user_prompt = _build_node_prompt(nodes)

    logger.info(
        "plan_workflow: board=%d user=%d nodes=%d provider=%s",
        vision_board_id,
        user_id,
        len(nodes),
        llm_kwargs.get("provider_name", "default"),
    )

    plan = await provider.generate_json(user_prompt, _PLANNER_SYSTEM)
    if plan is None:
        raise RuntimeError("LLM returned no plan. Try again or switch providers.")

    run = WorkflowRun(
        user_id=user_id,
        vision_board_id=vision_board_id,
        plan=plan,
        status="awaiting_confirmation",
    )
    db.add(run)
    await db.flush()
    await db.refresh(run)

    logger.info("plan_workflow: created WorkflowRun id=%d", run.id)
    return {"run_id": run.id, "status": run.status, "plan": plan}


# ── Execution helpers ──────────────────────────────────────────────────────────

# Maps node_type → provider family name (for API key lookup)
_NODE_TYPE_TO_PROVIDER_FAMILY: dict[str, str | None] = {
    "chatgpt_text": "openai",
    "chatgpt_image": "openai",
    "claude_text": "anthropic",
    "gemini_text": "gemini",
    "gemini_image": "gemini",
    "meshy_3d": "meshy",
    "stability_image": "stability",
    "internal_quiz": None,
    "internal_flashcard": None,
    "internal_summary": None,
}

# Fallback API keys from environment variables (per provider family)
_PROVIDER_ENV_KEY: dict[str, Any] = {
    "openai": lambda: settings.OPENAI_API_KEY,
    "anthropic": lambda: settings.ANTHROPIC_API_KEY,
    "gemini": lambda: settings.GEMINI_API_KEY,
    "meshy": lambda: settings.MESHY_API_KEY,
    "stability": lambda: settings.STABILITY_API_KEY,
}


def _resolve_api_key(node_type: str, user_settings: UserSettings | None) -> str:
    """
    Return the best API key for the given node_type.

    Priority:
      1. User's saved key, if their selected provider matches this node's family
      2. Environment variable for the provider family
    """
    family = _NODE_TYPE_TO_PROVIDER_FAMILY.get(node_type)
    if not family:
        return ""  # internal nodes don't need external keys

    # Check user's saved key
    if user_settings and user_settings.llm_api_key:
        if user_settings.llm_provider == family:
            return decrypt_secret(user_settings.llm_api_key)

    # Fall back to env var
    env_fn = _PROVIDER_ENV_KEY.get(family)
    return (env_fn() if env_fn else "") or ""


def _build_chained_prompt(
    node_prompt: str,
    upstream_output: dict[str, Any] | None,
) -> str:
    """
    Merge the node's configured prompt with chained output from an upstream node.
    Always truncates chained content to _TRUNCATE chars.
    """
    base = (node_prompt or "").strip()

    if not upstream_output:
        return base[:_TRUNCATE]

    content = str(upstream_output.get("content", ""))[:_TRUNCATE]
    out_type = upstream_output.get("type", "text")

    if out_type == "text":
        merged = f"[Context from previous step]\n{content}\n\n[Your task]\n{base}"
    else:
        # image or 3d — pass as a reference URL/URI in the prompt
        merged = f"{base}\n\n[Reference from previous step ({out_type}): {content}]"

    return merged[:_TRUNCATE + 500]  # a little extra room for the wrapper text


async def _execute_node_payload(
    node: WorkflowNode,
    final_prompt: str,
    api_key: str,
    user_settings: UserSettings | None,
    user_id: int,
) -> dict[str, Any]:
    """Dispatch to the correct WorkflowProvider or internal handler."""
    nt = node.node_type
    model = node.model or ""

    if nt == "chatgpt_text":
        from app.services.providers.openai import OpenAITextProvider
        return await OpenAITextProvider(model=model or "gpt-4o-mini").execute(
            final_prompt, api_key
        )

    if nt == "chatgpt_image":
        from app.services.providers.openai import OpenAIImageProvider
        return await OpenAIImageProvider(model=model or "dall-e-3").execute(
            final_prompt, api_key
        )

    if nt == "claude_text":
        from app.services.providers.anthropic import AnthropicTextProvider
        return await AnthropicTextProvider(
            model=model or "claude-sonnet-4-20250514"
        ).execute(final_prompt, api_key)

    if nt == "gemini_text":
        from app.services.providers.gemini import GeminiTextProvider
        return await GeminiTextProvider(model=model or "gemini-2.0-flash").execute(
            final_prompt, api_key
        )

    if nt == "gemini_image":
        from app.services.providers.gemini import GeminiImageProvider
        return await GeminiImageProvider().execute(final_prompt, api_key)

    if nt == "meshy_3d":
        from app.services.providers.meshy import MeshyProvider
        return await MeshyProvider().execute(final_prompt, api_key)

    if nt == "stability_image":
        from app.services.providers.stability import StabilityImageProvider
        return await StabilityImageProvider().execute(final_prompt, api_key)

    if nt in ("internal_quiz", "internal_flashcard", "internal_summary"):
        return await _execute_internal(nt, final_prompt, user_settings)

    raise ValueError(f"Unknown node_type: {nt!r}")


_INTERNAL_SYSTEMS = {
    "internal_summary": (
        "You are a concise summarizer. Given text, produce a clear bullet-point summary "
        "suitable for a student reviewing the topic. Return plain text only."
    ),
    "internal_quiz": (
        "You are a quiz generator. Given source material, create 5 multiple-choice questions "
        "with answers labeled A-D and mark the correct answer. Return plain text only."
    ),
    "internal_flashcard": (
        "You are a flashcard generator. Given source material, create 8 flashcards in the format:\n"
        "Front: <term or question>\nBack: <definition or answer>\n\nSeparate cards with ---.\n"
        "Return plain text only."
    ),
}


async def _execute_internal(
    node_type: str,
    prompt: str,
    user_settings: UserSettings | None,
) -> dict[str, Any]:
    """
    Run an internal node using the user's configured planning LLM.
    No external API key needed beyond what the user has already configured.
    """
    system = _INTERNAL_SYSTEMS[node_type]

    # Build LLM kwargs from user settings (same pattern as the planner)
    llm_kwargs: dict[str, Any] = {}
    if user_settings:
        api_key = decrypt_secret(user_settings.llm_api_key) if user_settings.llm_api_key else None
        llm_kwargs = {"provider_name": user_settings.llm_provider, "api_key": api_key}

    provider = get_provider(**llm_kwargs)
    result = await provider.generate_chat(
        messages=[{"role": "user", "content": prompt}],
        system=system,
    )
    if result is None:
        raise RuntimeError(f"{node_type}: LLM returned no response.")

    return {
        "type": "text",
        "content": result,
        "metadata": {"node_type": node_type},
    }


# ── Main execution loop ────────────────────────────────────────────────────────

async def execute_workflow(
    *,
    workflow_run_id: int,
    user_id: int,
    db: AsyncSession,
) -> None:
    """
    Execute all WorkflowNodes for a run in order, chaining outputs.

    Mutates node.status / node.output_data and run.status in the DB.
    Halts on the first failed node and marks the run as failed.
    """
    # Load run — always filter by user_id
    run: WorkflowRun | None = await db.get(WorkflowRun, workflow_run_id)
    if not run or run.user_id != user_id:
        raise ValueError("Workflow run not found.")

    # Load nodes for this board in execution order
    result = await db.execute(
        select(WorkflowNode)
        .where(
            WorkflowNode.vision_board_id == run.vision_board_id,
            WorkflowNode.user_id == user_id,
        )
        .order_by(WorkflowNode.node_order)
    )
    nodes: list[WorkflowNode] = list(result.scalars().all())

    if not nodes:
        run.status = "failed"
        run.completed_at = datetime.now(timezone.utc)
        await db.flush()
        return

    # Load user settings once — used for API key resolution and internal nodes
    user_settings: UserSettings | None = await db.scalar(
        select(UserSettings).where(UserSettings.user_id == user_id)
    )

    run.status = "running"
    await db.commit()  # commit immediately so pollers see "running"

    print(
        f"[workflow] run={workflow_run_id} user={user_id} "
        f"nodes={len(nodes)} — starting execution",
        flush=True,
    )

    # Build an index of node outputs for chaining (keyed by node.id)
    output_index: dict[int, dict[str, Any]] = {}

    for node in nodes:
        node.status = "running"
        await db.commit()  # commit so pollers see each node start

        print(
            f"[workflow] run={workflow_run_id} node={node.id} "
            f"type={node.node_type} order={node.node_order} — executing",
            flush=True,
        )

        try:
            # Resolve upstream output for chaining
            upstream_output = (
                output_index.get(node.input_from_node_id)
                if node.input_from_node_id
                else None
            )

            # Build the fully-merged prompt
            final_prompt = _build_chained_prompt(node.prompt or "", upstream_output)

            # Resolve API key for this node's provider family
            api_key = _resolve_api_key(node.node_type, user_settings)

            # Execute
            output = await _execute_node_payload(
                node, final_prompt, api_key, user_settings, user_id
            )

            node.output_data = output
            node.status = "done"
            output_index[node.id] = output
            await db.commit()  # commit node result immediately

            print(
                f"[workflow] run={workflow_run_id} node={node.id} — done "
                f"(type={output.get('type')})",
                flush=True,
            )

        except Exception as exc:
            logger.error(
                "Workflow run=%d node=%d failed: %s",
                workflow_run_id,
                node.id,
                exc,
                exc_info=True,
            )
            print(
                f"[workflow] run={workflow_run_id} node={node.id} — FAILED: {exc}",
                flush=True,
            )
            node.status = "failed"
            node.output_data = {
                "type": "error",
                "content": str(exc),
                "metadata": {},
            }
            run.status = "failed"
            run.completed_at = datetime.now(timezone.utc)
            await db.commit()
            return

    run.status = "done"
    run.completed_at = datetime.now(timezone.utc)
    await db.commit()

    print(
        f"[workflow] run={workflow_run_id} — ALL DONE ({len(nodes)} nodes)",
        flush=True,
    )


async def _run_workflow_bg(workflow_run_id: int, user_id: int) -> None:
    """
    Background-task wrapper: creates its own DB session independent of the HTTP
    request so the execution can outlive the response.
    """
    async with AsyncSessionLocal() as db:
        try:
            await execute_workflow(
                workflow_run_id=workflow_run_id,
                user_id=user_id,
                db=db,
            )
            # execute_workflow commits after each node internally; this is a safety net
            await db.commit()
            logger.info("_run_workflow_bg: run=%d complete", workflow_run_id)
        except Exception as exc:
            try:
                await db.rollback()
            except Exception:
                pass
            logger.error(
                "_run_workflow_bg: run=%d unhandled error — %s",
                workflow_run_id,
                exc,
                exc_info=True,
            )
            print(f"[workflow] _run_workflow_bg CRASH run={workflow_run_id}: {exc}", flush=True)
