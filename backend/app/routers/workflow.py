"""
Workflow router — Phase 2.

Endpoints:
  POST  /api/workflow/nodes         — create a WorkflowNode on a board
  POST  /api/workflow/plan          — read board nodes, ask LLM for execution plan
  POST  /api/workflow/execute       — start execution as a background task
  GET   /api/workflow/runs/{run_id} — poll run status + all node outputs
  GET   /api/workflow/boards/{board_id}/nodes — list nodes for a board
"""

import asyncio
import os

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import User, WorkflowNode, WorkflowRun
from app.routers.auth import get_current_user
from app.routers.settings import get_user_llm_kwargs
from app.services.workflow_engine import _run_workflow_bg, plan_workflow

router = APIRouter(prefix="/workflow", tags=["workflow"])


def _check_feature_flag() -> None:
    if os.getenv("ENABLE_WORKFLOW_NODES", "false").lower() != "true":
        raise HTTPException(
            status_code=403,
            detail="Workflow nodes are not enabled. Set ENABLE_WORKFLOW_NODES=true.",
        )


# ── Schemas ────────────────────────────────────────────────────────────────────

class CreateNodeRequest(BaseModel):
    vision_board_id: int
    node_order: int
    node_type: str
    prompt: str | None = None
    provider: str | None = None
    model: str | None = None
    input_from_node_id: int | None = None


class PlanRequest(BaseModel):
    vision_board_id: int


class ExecuteRequest(BaseModel):
    workflow_run_id: int


class NodeOut(BaseModel):
    id: int
    node_order: int
    node_type: str
    prompt: str | None
    provider: str | None
    model: str | None
    input_from_node_id: int | None
    status: str
    output_data: dict | None
    updated_at: str


class WorkflowRunResponse(BaseModel):
    id: int
    vision_board_id: int
    status: str
    plan: dict | None
    started_at: str
    completed_at: str | None
    nodes: list[NodeOut] = []


# ── Helpers ────────────────────────────────────────────────────────────────────

def _node_out(node: WorkflowNode) -> NodeOut:
    return NodeOut(
        id=node.id,
        node_order=node.node_order,
        node_type=node.node_type,
        prompt=node.prompt,
        provider=node.provider,
        model=node.model,
        input_from_node_id=node.input_from_node_id,
        status=node.status,
        output_data=node.output_data,
        updated_at=node.updated_at.isoformat(),
    )


def _owned_run_or_404(run: WorkflowRun | None, user_id: int) -> WorkflowRun:
    if not run or run.user_id != user_id:
        raise HTTPException(status_code=404, detail="Workflow run not found.")
    return run


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/nodes", status_code=201)
async def create_node(
    body: CreateNodeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a WorkflowNode to a Vision Board."""
    _check_feature_flag()

    _VALID_TYPES = {
        "chatgpt_text", "chatgpt_image", "claude_text", "gemini_text",
        "gemini_image", "meshy_3d", "stability_image",
        "internal_quiz", "internal_flashcard", "internal_summary",
    }
    if body.node_type not in _VALID_TYPES:
        raise HTTPException(status_code=422, detail=f"Invalid node_type: {body.node_type!r}")

    # Verify input_from_node_id belongs to this user if set
    if body.input_from_node_id:
        upstream = await db.get(WorkflowNode, body.input_from_node_id)
        if not upstream or upstream.user_id != current_user.id:
            raise HTTPException(status_code=404, detail="Upstream node not found.")

    node = WorkflowNode(
        user_id=current_user.id,
        vision_board_id=body.vision_board_id,
        node_order=body.node_order,
        node_type=body.node_type,
        prompt=body.prompt,
        provider=body.provider,
        model=body.model,
        input_from_node_id=body.input_from_node_id,
        status="pending",
    )
    db.add(node)
    await db.flush()
    await db.refresh(node)
    return _node_out(node)


@router.get("/boards/{board_id}/nodes", response_model=list[NodeOut])
async def list_nodes(
    board_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all WorkflowNodes for a board, ordered by node_order."""
    _check_feature_flag()

    result = await db.execute(
        select(WorkflowNode)
        .where(
            WorkflowNode.vision_board_id == board_id,
            WorkflowNode.user_id == current_user.id,
        )
        .order_by(WorkflowNode.node_order)
    )
    return [_node_out(n) for n in result.scalars().all()]


@router.post("/plan")
async def create_plan(
    body: PlanRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Read all WorkflowNodes for a Vision Board in order, send them to the
    user's LLM, and return a structured JSON execution plan.
    Creates a WorkflowRun with status="awaiting_confirmation".
    """
    _check_feature_flag()

    llm_kwargs = await get_user_llm_kwargs(db, current_user.id)
    try:
        result = await plan_workflow(
            vision_board_id=body.vision_board_id,
            user_id=current_user.id,
            db=db,
            llm_kwargs=llm_kwargs,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return result


@router.post("/execute", status_code=202)
async def run_execute(
    body: ExecuteRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Start workflow execution as a background task.
    Returns immediately with {run_id, status: "running"}.
    Poll GET /workflow/runs/{id} to track progress.
    """
    _check_feature_flag()

    run: WorkflowRun | None = await db.get(WorkflowRun, body.workflow_run_id)
    _owned_run_or_404(run, current_user.id)

    if run.status not in ("awaiting_confirmation", "failed"):
        raise HTTPException(
            status_code=409,
            detail=f"Run is in status={run.status!r}. Only 'awaiting_confirmation' or 'failed' runs can be started.",
        )

    # asyncio.create_task runs independently of the HTTP request lifecycle,
    # avoiding SQLite lock contention with the get_db session teardown.
    asyncio.get_event_loop().create_task(
        _run_workflow_bg(body.workflow_run_id, current_user.id)
    )

    # Return "running" optimistically — the background task commits that state shortly
    return {"run_id": run.id, "status": "running"}


@router.get("/runs/{run_id}", response_model=WorkflowRunResponse)
async def get_run(
    run_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Return status, plan, and per-node outputs for a WorkflowRun.
    Designed for polling — nodes include current status and output_data.
    """
    _check_feature_flag()

    run: WorkflowRun | None = await db.get(WorkflowRun, run_id)
    _owned_run_or_404(run, current_user.id)

    # Load nodes for this run's board (user-scoped)
    result = await db.execute(
        select(WorkflowNode)
        .where(
            WorkflowNode.vision_board_id == run.vision_board_id,
            WorkflowNode.user_id == current_user.id,
        )
        .order_by(WorkflowNode.node_order)
    )
    nodes = [_node_out(n) for n in result.scalars().all()]

    return WorkflowRunResponse(
        id=run.id,
        vision_board_id=run.vision_board_id,
        status=run.status,
        plan=run.plan,
        started_at=run.started_at.isoformat(),
        completed_at=run.completed_at.isoformat() if run.completed_at else None,
        nodes=nodes,
    )
