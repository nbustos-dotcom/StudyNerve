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
  DELETE /api/vision/boards/{id}/disconnect       — remove a connection

  POST   /api/vision/boards/{id}/make-sense       — AI: analyze canvas, return one action
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
    BoardDetail,
    BoardSummary,
    ConnectNodesRequest,
    DisconnectNodesRequest,
    CreateBoardRequest,
    CreateNodeRequest,
    MakeSenseRequest,
    MakeSenseResponse,
    NodeResponse,
    SaveTldrawStateRequest,
    UpdateBoardRequest,
    UpdateNodePositionRequest,
    UpdateNodeRequest,
)
from app.services.make_sense import make_sense
from app.services.quota import BUCKET_NOTES_AI, enforce_user_call
from app.services.user_context import build_user_context

router = APIRouter(prefix="/vision", tags=["vision"])
_limiter = Limiter(key_func=get_remote_address)


def _estimate_tokens(*parts: str) -> int:
    return max(1, sum(len(p or "") for p in parts) // 4)


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
        tldraw_state=board.tldraw_state,
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
    done: dict[int, int] = {}
    if board_ids:
        counts_result = await db.execute(
            select(VisionStep.board_id, func.count(VisionStep.id).label("cnt"))
            .where(VisionStep.board_id.in_(board_ids))
            .group_by(VisionStep.board_id)
        )
        counts = {row.board_id: row.cnt for row in counts_result}

        done_result = await db.execute(
            select(VisionStep.board_id, func.count(VisionStep.id).label("cnt"))
            .where(VisionStep.board_id.in_(board_ids), VisionStep.is_completed == True)  # noqa: E712
            .group_by(VisionStep.board_id)
        )
        done = {row.board_id: row.cnt for row in done_result}

    return [
        BoardSummary(
            id=b.id,
            title=b.title,
            is_ai_generated=b.is_ai_generated,
            node_count=counts.get(b.id, 0),
            done_count=done.get(b.id, 0),
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


@router.put("/boards/{board_id}", response_model=BoardDetail)
async def update_board(
    board_id: int,
    body: UpdateBoardRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    board = await db.get(VisionBoard, board_id)
    _owned_board_or_404(board, current_user.id)
    if body.title is not None:
        stripped = body.title.strip()
        if stripped:
            board.title = stripped
    await db.flush()
    return await _board_detail(board, db)


@router.put("/boards/{board_id}/tldraw-state", response_model=BoardDetail)
async def save_tldraw_state(
    board_id: int,
    body: SaveTldrawStateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    board = await db.get(VisionBoard, board_id)
    _owned_board_or_404(board, current_user.id)
    board.tldraw_state = body.tldraw_state
    await db.flush()
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


# ── AI endpoint ───────────────────────────────────────────────────────────────

@router.post("/boards/{board_id}/make-sense", response_model=MakeSenseResponse)
@_limiter.limit("5/minute")
async def make_sense_board(
    request: Request,
    board_id: int,
    body: MakeSenseRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Analyze the current tldraw canvas and return one AI action:
    ask (sparse) / cluster (messy) / expand (organized).
    The frontend renders suggestions as ghost stickies; nothing is written to DB here.
    """
    board = await db.get(VisionBoard, board_id)
    _owned_board_or_404(board, current_user.id)

    try:
        raw_ctx = await build_user_context(current_user.id, db)
        ctx_hint = (
            "The student's recent study activity:\n" + raw_ctx
        ) if raw_ctx else ""
    except Exception:
        ctx_hint = ""

    await enforce_user_call(
        db, current_user.id, BUCKET_NOTES_AI,
        _estimate_tokens(
            body.tldraw_state or "",
            ctx_hint,
            body.board_title or "",
            body.step_title or "",
            body.step_description or "",
        ),
    )

    llm_kwargs = await get_user_llm_kwargs(db, current_user.id)

    try:
        result = await make_sense(
            body.tldraw_state,
            context_hint=ctx_hint,
            mode=body.mode,
            board_title=body.board_title,
            step_title=body.step_title,
            step_description=body.step_description,
            **llm_kwargs,
        )
    except LLMTokenLimitError as exc:
        raise HTTPException(status_code=422, detail=exc.message)
    except Exception:
        raise HTTPException(status_code=502, detail="Couldn't read canvas, try again.")

    if not result or not isinstance(result.get("items"), list):
        raise HTTPException(status_code=502, detail="Couldn't read canvas, try again.")

    items = []
    for item in result["items"][:8]:
        if not isinstance(item, dict):
            continue
        items.append({
            "type": item.get("type", "step"),
            "text": str(item["text"])[:120] if item.get("text") else None,
            "title": str(item["title"])[:120] if item.get("title") else None,
            "description": str(item["description"])[:200] if item.get("description") else None,
            "x": float(item["x"]) if item.get("x") is not None else None,
            "y": float(item["y"]) if item.get("y") is not None else None,
        })

    return MakeSenseResponse(
        action=str(result.get("action", "ask")),
        items=items,
        explanation=str(result.get("explanation", ""))[:300],
    )
