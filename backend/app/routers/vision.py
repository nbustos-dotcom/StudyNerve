"""
Vision Board router.

Endpoints:
  POST   /api/vision/boards                       — create empty board
  GET    /api/vision/boards                       — list all boards for current user
  GET    /api/vision/boards/{id}                  — get board with all nodes
  DELETE /api/vision/boards/{id}                  — delete board and all nodes

  POST   /api/vision/boards/{id}/nodes            — create a node
  PUT    /api/vision/nodes/{id}                   — update node (title, desc, x, y, is_completed)
  DELETE /api/vision/nodes/{id}                   — delete a node
  PUT    /api/vision/nodes/{id}/position          — update x,y only (drag moves)

  POST   /api/vision/boards/{id}/connect          — connect two nodes (sets parent_step_id)

  POST   /api/vision/boards/{id}/ai-organize      — LLM suggests ordering/grouping
  POST   /api/vision/boards/{id}/ai-breakdown     — LLM breaks one node into sub-tasks
  POST   /api/vision/nodes/{id}/ask               — tutor Q&A about a node
"""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import APIRouter, Depends, HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.database import get_db
from app.models import User, VisionBoard, VisionStep
from app.providers.base import LLMTokenLimitError
from app.routers.auth import get_current_user
from app.routers.settings import get_user_llm_kwargs
from app.schemas import (
    AiBreakdownResponse,
    AiMissingStep,
    AiOrganizeResponse,
    AiOrganizeSuggestion,
    AskNodeRequest,
    BoardDetail,
    BoardSummary,
    AiVisionRequest,
    AiVisionResponse,
    AiVisionConnectionResult,
    ConnectNodesRequest,
    DisconnectNodesRequest,
    CreateBoardRequest,
    CreateNodeRequest,
    NodeResponse,
    UpdateNodePositionRequest,
    UpdateNodeRequest,
)
from app.services.user_context import build_user_context
from app.services.vision import ai_ask, ai_breakdown, ai_organize, ai_vision

router = APIRouter(prefix="/vision", tags=["vision"])
_limiter = Limiter(key_func=get_remote_address)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _owned_board_or_404(board: VisionBoard | None, user_id: int) -> VisionBoard:
    if not board or board.user_id != user_id:
        raise HTTPException(status_code=404, detail="Board not found.")
    return board


def _owned_node_or_404(node: VisionStep | None, board: VisionBoard | None, user_id: int) -> tuple[VisionStep, VisionBoard]:
    if not node or not board or board.user_id != user_id:
        raise HTTPException(status_code=404, detail="Node not found.")
    return node, board


def _node_resp(step: VisionStep) -> NodeResponse:
    return NodeResponse(
        id=step.id,
        board_id=step.board_id,
        title=step.title,
        description=step.description,
        x_position=step.x_position or 0.0,
        y_position=step.y_position or 0.0,
        is_completed=step.is_completed,
        parent_step_id=step.parent_step_id,
        created_at=step.created_at,
        updated_at=step.updated_at,
    )


async def _load_nodes(board_id: int, db: AsyncSession) -> list[VisionStep]:
    result = await db.execute(
        select(VisionStep)
        .where(VisionStep.board_id == board_id)
        .order_by(VisionStep.order_index, VisionStep.id)
    )
    return list(result.scalars().all())


async def _board_detail(board: VisionBoard, db: AsyncSession) -> BoardDetail:
    nodes = await _load_nodes(board.id, db)
    return BoardDetail(
        id=board.id,
        title=board.title,
        is_ai_generated=board.is_ai_generated,
        created_at=board.created_at,
        updated_at=board.updated_at,
        nodes=[_node_resp(n) for n in nodes],
    )


# ── Board CRUD ────────────────────────────────────────────────────────────────

@router.post("/boards", response_model=BoardDetail, status_code=201)
async def create_board(
    body: CreateBoardRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not body.title.strip():
        raise HTTPException(status_code=422, detail="title must not be empty.")
    board = VisionBoard(
        title=body.title.strip(),
        user_id=current_user.id,
    )
    db.add(board)
    await db.flush()
    await db.refresh(board)
    return await _board_detail(board, db)


@router.get("/boards", response_model=list[BoardSummary])
async def list_boards(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    boards_result = await db.execute(
        select(VisionBoard)
        .where(VisionBoard.user_id == current_user.id)
        .order_by(VisionBoard.updated_at.desc())
    )
    boards = list(boards_result.scalars().all())

    board_ids = [b.id for b in boards]
    counts: dict[int, int] = {}
    if board_ids:
        counts_result = await db.execute(
            select(VisionStep.board_id, func.count(VisionStep.id).label("cnt"))
            .where(VisionStep.board_id.in_(board_ids))
            .group_by(VisionStep.board_id)
        )
        counts = {row.board_id: row.cnt for row in counts_result}

    return [
        BoardSummary(
            id=b.id,
            title=b.title,
            is_ai_generated=b.is_ai_generated,
            node_count=counts.get(b.id, 0),
            created_at=b.created_at,
            updated_at=b.updated_at,
        )
        for b in boards
    ]


@router.get("/boards/{board_id}", response_model=BoardDetail)
async def get_board(
    board_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    board = await db.get(VisionBoard, board_id)
    _owned_board_or_404(board, current_user.id)
    return await _board_detail(board, db)


@router.delete("/boards/{board_id}", status_code=204)
async def delete_board(
    board_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    board = await db.get(VisionBoard, board_id)
    _owned_board_or_404(board, current_user.id)
    await db.delete(board)


# ── Node CRUD ─────────────────────────────────────────────────────────────────

@router.post("/boards/{board_id}/nodes", response_model=NodeResponse, status_code=201)
async def create_node(
    board_id: int,
    body: CreateNodeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    board = await db.get(VisionBoard, board_id)
    _owned_board_or_404(board, current_user.id)

    if body.parent_step_id is not None:
        parent = await db.get(VisionStep, body.parent_step_id)
        if not parent or parent.board_id != board_id:
            raise HTTPException(status_code=404, detail="Parent node not found on this board.")

    # order_index = count of existing root nodes (or siblings)
    sibling_count = await db.scalar(
        select(func.count(VisionStep.id)).where(
            VisionStep.board_id == board_id,
            VisionStep.parent_step_id == body.parent_step_id,
        )
    )

    node = VisionStep(
        board_id=board_id,
        title=body.title.strip(),
        description=body.description,
        x_position=body.x,
        y_position=body.y,
        parent_step_id=body.parent_step_id,
        order_index=sibling_count or 0,
    )
    db.add(node)
    await db.flush()
    await db.refresh(node)
    return _node_resp(node)


@router.put("/nodes/{node_id}", response_model=NodeResponse)
async def update_node(
    node_id: int,
    body: UpdateNodeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    node = await db.get(VisionStep, node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found.")
    board = await db.get(VisionBoard, node.board_id)
    _owned_node_or_404(node, board, current_user.id)

    if body.title is not None:
        node.title = body.title.strip() or node.title
    if body.description is not None:
        node.description = body.description or None
    if body.x is not None:
        node.x_position = body.x
    if body.y is not None:
        node.y_position = body.y
    if body.is_completed is not None:
        node.is_completed = body.is_completed

    await db.flush()
    await db.refresh(node)
    return _node_resp(node)


@router.delete("/nodes/{node_id}", status_code=204)
async def delete_node(
    node_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    node = await db.get(VisionStep, node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found.")
    board = await db.get(VisionBoard, node.board_id)
    _owned_node_or_404(node, board, current_user.id)
    await db.delete(node)


@router.put("/nodes/{node_id}/position", response_model=NodeResponse)
async def update_node_position(
    node_id: int,
    body: UpdateNodePositionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    node = await db.get(VisionStep, node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found.")
    board = await db.get(VisionBoard, node.board_id)
    _owned_node_or_404(node, board, current_user.id)

    node.x_position = body.x
    node.y_position = body.y
    await db.flush()
    await db.refresh(node)
    return _node_resp(node)


# ── Connections ───────────────────────────────────────────────────────────────

@router.post("/boards/{board_id}/connect", response_model=NodeResponse)
async def connect_nodes(
    board_id: int,
    body: ConnectNodesRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Set parent_step_id of to_id to from_id, creating a directional connection."""
    board = await db.get(VisionBoard, board_id)
    _owned_board_or_404(board, current_user.id)

    from_node = await db.get(VisionStep, body.from_id)
    to_node = await db.get(VisionStep, body.to_id)

    if not from_node or from_node.board_id != board_id:
        raise HTTPException(status_code=404, detail="from_id not found on this board.")
    if not to_node or to_node.board_id != board_id:
        raise HTTPException(status_code=404, detail="to_id not found on this board.")
    if body.from_id == body.to_id:
        raise HTTPException(status_code=422, detail="Cannot connect a node to itself.")

    to_node.parent_step_id = body.from_id
    await db.flush()
    await db.refresh(to_node)
    return _node_resp(to_node)


@router.delete("/boards/{board_id}/disconnect", status_code=204)
async def disconnect_nodes(
    board_id: int,
    body: DisconnectNodesRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove the connection between two nodes by clearing parent_step_id on to_id."""
    board = await db.get(VisionBoard, board_id)
    _owned_board_or_404(board, current_user.id)

    to_node = await db.get(VisionStep, body.to_id)
    if not to_node or to_node.board_id != board_id:
        raise HTTPException(status_code=404, detail="to_id not found on this board.")
    if to_node.parent_step_id != body.from_id:
        raise HTTPException(status_code=422, detail="No connection exists between these nodes.")

    to_node.parent_step_id = None
    await db.flush()


# ── AI endpoints ──────────────────────────────────────────────────────────────

@router.post("/boards/{board_id}/ai-vision", response_model=AiVisionResponse, status_code=201)
@_limiter.limit("10/minute")
async def ai_vision_board(
    request: Request,
    board_id: int,
    body: AiVisionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Generate a full visual mind map from a free-form project description.
    Creates all nodes and connections in the DB, returns them.
    """
    if not body.description.strip():
        raise HTTPException(status_code=422, detail="description must not be empty.")

    board = await db.get(VisionBoard, board_id)
    _owned_board_or_404(board, current_user.id)

    llm_kwargs = await get_user_llm_kwargs(db, current_user.id)

    try:
        _raw_ctx = await build_user_context(current_user.id, db)
        ctx_hint = (
            "## Student Context Snapshot"
            " (connect new nodes to concepts from the student's recent notes when relevant;"
            " surface upcoming deadlines as priority steps)\n"
            + _raw_ctx
        ) if _raw_ctx else ""
    except Exception:
        ctx_hint = ""

    try:
        result = await ai_vision(body.description, context_hint=ctx_hint, **llm_kwargs)
    except LLMTokenLimitError as exc:
        raise HTTPException(status_code=422, detail=exc.message)

    if result is None or not result.get("nodes"):
        raise HTTPException(status_code=502, detail="LLM unavailable or returned no nodes.")

    raw_nodes = result.get("nodes", [])[:12]  # cap at 12
    raw_conns = result.get("connections", [])

    # Create all nodes first (no parent yet — avoids forward-reference issues)
    existing_count = await db.scalar(
        select(func.count(VisionStep.id)).where(VisionStep.board_id == board_id)
    )
    created: list[VisionStep] = []
    for i, item in enumerate(raw_nodes):
        node = VisionStep(
            board_id=board_id,
            title=str(item.get("title", f"Node {i+1}")).strip()[:120],
            description=str(item["description"]).strip()[:400] if item.get("description") else None,
            x_position=float(item.get("x", 100 + i * 220)),
            y_position=float(item.get("y", 250)),
            order_index=(existing_count or 0) + i,
        )
        db.add(node)
        created.append(node)

    await db.flush()
    for n in created:
        await db.refresh(n)

    # Apply connections — each child node can have at most one parent
    applied_conns: list[AiVisionConnectionResult] = []
    child_has_parent: set[int] = set()
    for conn in raw_conns:
        fi = conn.get("from_index")
        ti = conn.get("to_index")
        if fi is None or ti is None:
            continue
        if not (0 <= fi < len(created) and 0 <= ti < len(created)):
            continue
        if fi == ti:
            continue
        if ti in child_has_parent:
            continue  # skip duplicate parents
        created[ti].parent_step_id = created[fi].id
        child_has_parent.add(ti)
        applied_conns.append(AiVisionConnectionResult(
            from_id=created[fi].id,
            to_id=created[ti].id,
        ))

    board.is_ai_generated = True
    await db.flush()
    for n in created:
        await db.refresh(n)

    return AiVisionResponse(
        nodes=[_node_resp(n) for n in created],
        connections=applied_conns,
    )


@router.post("/boards/{board_id}/ai-organize", response_model=AiOrganizeResponse)
@_limiter.limit("10/minute")
async def ai_organize_board(
    request: Request,
    board_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Send all nodes to the LLM. Returns suggested ordering and grouping.
    Does not automatically apply the suggestion — the frontend decides.
    """
    board = await db.get(VisionBoard, board_id)
    _owned_board_or_404(board, current_user.id)

    nodes = await _load_nodes(board_id, db)
    if not nodes:
        raise HTTPException(status_code=422, detail="Board has no nodes to organize.")

    node_dicts = [
        {"id": n.id, "title": n.title, "description": n.description}
        for n in nodes
    ]

    llm_kwargs = await get_user_llm_kwargs(db, current_user.id)
    try:
        result = await ai_organize(node_dicts, **llm_kwargs)
    except LLMTokenLimitError as exc:
        raise HTTPException(status_code=422, detail=exc.message)

    if result is None:
        raise HTTPException(status_code=502, detail="LLM unavailable or failed to respond.")

    reordered = [
        AiOrganizeSuggestion(
            id=item["id"],
            suggested_order=item["suggested_order"],
            group_name=item.get("group_name"),
        )
        for item in result.get("reordered", [])
    ]
    missing = [
        AiMissingStep(
            title=item["title"],
            description=item.get("description"),
            connect_after_id=item.get("connect_after_id"),
        )
        for item in result.get("missing_steps", [])
    ]
    return AiOrganizeResponse(reordered=reordered, missing_steps=missing)


@router.post("/boards/{board_id}/ai-breakdown", response_model=AiBreakdownResponse)
@_limiter.limit("10/minute")
async def ai_breakdown_node(
    request: Request,
    board_id: int,
    body: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Break a single node into 2-4 sub-tasks.
    Body: {node_id: int}
    Creates new nodes connected to the parent and returns them.
    """
    board = await db.get(VisionBoard, board_id)
    _owned_board_or_404(board, current_user.id)

    node_id = body.get("node_id")
    if not node_id:
        raise HTTPException(status_code=422, detail="node_id is required.")

    parent = await db.get(VisionStep, node_id)
    if not parent or parent.board_id != board_id:
        raise HTTPException(status_code=404, detail="Node not found on this board.")

    llm_kwargs = await get_user_llm_kwargs(db, current_user.id)
    try:
        result = await ai_breakdown(parent.title, parent.description, **llm_kwargs)
    except LLMTokenLimitError as exc:
        raise HTTPException(status_code=422, detail=exc.message)

    if result is None:
        raise HTTPException(status_code=502, detail="LLM unavailable or failed to respond.")

    subtasks = result.get("subtasks", [])
    if not subtasks:
        raise HTTPException(status_code=502, detail="LLM returned no subtasks.")

    # Space new nodes in a column below the parent
    start_x = (parent.x_position or 0.0) + 220
    start_y = (parent.y_position or 0.0) - ((len(subtasks) - 1) * 90 / 2)

    created: list[VisionStep] = []
    existing_children = await db.scalar(
        select(func.count(VisionStep.id)).where(VisionStep.parent_step_id == parent.id)
    )
    for i, sub in enumerate(subtasks):
        node = VisionStep(
            board_id=board_id,
            title=sub.get("title", f"Sub-task {i + 1}"),
            description=sub.get("description"),
            parent_step_id=parent.id,
            order_index=(existing_children or 0) + i,
            x_position=start_x,
            y_position=start_y + i * 90,
        )
        db.add(node)
        created.append(node)

    board.is_ai_generated = True
    await db.flush()
    for n in created:
        await db.refresh(n)

    return AiBreakdownResponse(created_nodes=[_node_resp(n) for n in created])


@router.post("/nodes/{node_id}/ask")
@_limiter.limit("20/minute")
async def ask_about_node(
    request: Request,
    node_id: int,
    body: AskNodeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    node = await db.get(VisionStep, node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found.")
    board = await db.get(VisionBoard, node.board_id)
    _owned_node_or_404(node, board, current_user.id)

    all_nodes = await _load_nodes(board.id, db)
    node_dicts = [
        {"title": n.title, "is_completed": n.is_completed}
        for n in all_nodes
    ]

    llm_kwargs = await get_user_llm_kwargs(db, current_user.id)
    try:
        answer = await ai_ask(body.question, board.title, node_dicts, **llm_kwargs)
    except LLMTokenLimitError as exc:
        raise HTTPException(status_code=422, detail=exc.message)

    if answer is None:
        raise HTTPException(status_code=502, detail="LLM unavailable or failed to respond.")

    return {"node_id": node_id, "question": body.question, "answer": answer}
