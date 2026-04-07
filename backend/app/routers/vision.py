"""
Vision Board router.

Endpoints:
  POST /api/vision/create                     — create board (manual or from Canvas)
  GET  /api/vision/boards                     — list all boards with progress
  GET  /api/vision/boards/{id}                — board detail with nested steps
  PUT  /api/vision/steps/{id}                 — update / complete a step
  POST /api/vision/boards/{id}/add-step       — manually add a step
  DELETE /api/vision/steps/{id}               — delete a step
  POST /api/vision/steps/{id}/ask             — quick tutor Q&A about a step
  PUT  /api/vision/boards/{id}/reorder        — reorder steps by explicit ID list
"""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import APIRouter, Depends, HTTPException

import httpx

from app.database import get_db
from app.llm import generate_chat
from app.models import Note, User, VisionBoard, VisionStep
from app.routers.auth import get_current_user
from app.routers.settings import get_user_canvas_creds, get_user_llm_kwargs
from app.schemas import (
    AddVisionStepRequest,
    AskStepRequest,
    CreateVisionBoardRequest,
    ReorderStepsRequest,
    UpdateVisionStepRequest,
    VisionBoardDetail,
    VisionBoardSummary,
    VisionStepResponse,
)
from app.services import canvas as canvas_svc
from app.services import vision as vision_svc

router = APIRouter(prefix="/vision", tags=["vision"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _step_to_dict(step: VisionStep) -> dict:
    return {
        "id": step.id,
        "board_id": step.board_id,
        "title": step.title,
        "description": step.description,
        "order_index": step.order_index,
        "parent_step_id": step.parent_step_id,
        "is_completed": step.is_completed,
        "estimated_minutes": step.estimated_minutes,
        "created_at": step.created_at,
        "updated_at": step.updated_at,
        "substeps": [],
    }


def _nest_steps(flat: list[VisionStep]) -> list[VisionStepResponse]:
    by_id: dict[int, dict] = {s.id: _step_to_dict(s) for s in flat}
    roots: list[dict] = []

    for s in flat:
        d = by_id[s.id]
        if s.parent_step_id is None:
            roots.append(d)
        elif s.parent_step_id in by_id:
            by_id[s.parent_step_id]["substeps"].append(d)

    def _build(d: dict) -> VisionStepResponse:
        substeps = [_build(sub) for sub in d.pop("substeps")]
        return VisionStepResponse(**d, substeps=substeps)

    return [_build(r) for r in roots]


async def _load_flat_steps(board_id: int, db: AsyncSession) -> list[VisionStep]:
    result = await db.execute(
        select(VisionStep)
        .where(VisionStep.board_id == board_id)
        .order_by(VisionStep.order_index)
    )
    return list(result.scalars().all())


async def _board_detail(board: VisionBoard, db: AsyncSession) -> VisionBoardDetail:
    flat = await _load_flat_steps(board.id, db)
    return VisionBoardDetail(
        id=board.id,
        title=board.title,
        description=board.description,
        source_type=board.source_type,
        source_id=board.source_id,
        note_id=board.note_id,
        status=board.status,
        progress=board.progress,
        created_at=board.created_at,
        updated_at=board.updated_at,
        steps=_nest_steps(flat),
    )


async def _sync_progress(board: VisionBoard, db: AsyncSession) -> None:
    pct = await vision_svc.calculate_progress(board.id, db)
    board.progress = pct
    if pct == 100:
        board.status = "completed"
    elif board.status == "completed" and pct < 100:
        board.status = "active"


def _owned_board_or_404(board: VisionBoard | None, user_id: int) -> VisionBoard:
    if not board or board.user_id != user_id:
        raise HTTPException(status_code=404, detail="Board not found.")
    return board


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/create", response_model=VisionBoardDetail, status_code=201)
async def create_board(
    body: CreateVisionBoardRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.canvas_assignment_id is not None:
        if body.canvas_course_id is None:
            raise HTTPException(
                status_code=422,
                detail="canvas_course_id is required when canvas_assignment_id is provided.",
            )
        canvas_url, canvas_token = await get_user_canvas_creds(db, current_user.id)
        try:
            assignment = await canvas_svc.get_single_assignment(
                body.canvas_course_id, body.canvas_assignment_id, canvas_url, canvas_token
            )
        except httpx.HTTPStatusError as exc:
            raise HTTPException(
                status_code=502,
                detail=f"Could not fetch Canvas assignment: {exc.response.status_code}",
            )
        except httpx.RequestError:
            raise HTTPException(status_code=502, detail="Could not reach Canvas.")

        title = assignment["name"]
        description = assignment.get("description") or ""
        source_type = "canvas_assignment"
        source_id = body.canvas_assignment_id
    else:
        if not body.title or not body.title.strip():
            raise HTTPException(status_code=422, detail="title is required for manual boards.")
        title = body.title.strip()
        description = (body.description or "").strip()
        source_type = "manual"
        source_id = None

    linked_note_id: int | None = None
    linked_note_content: str | None = None
    if source_type == "manual" and body.note_id:
        note_row = await db.get(Note, body.note_id)
        if note_row and note_row.user_id == current_user.id:
            linked_note_id = note_row.id
            linked_note_content = note_row.content

    board = VisionBoard(
        title=title,
        description=description,
        source_type=source_type,
        source_id=source_id,
        note_id=linked_note_id,
        user_id=current_user.id,
    )
    db.add(board)
    await db.flush()

    llm_kwargs = await get_user_llm_kwargs(db, current_user.id)
    breakdown = await vision_svc.generate_breakdown(title, description, linked_note_content, **llm_kwargs)
    steps_data: list[dict] = (breakdown or {}).get("steps", [])

    for order, step_data in enumerate(steps_data):
        parent = VisionStep(
            board_id=board.id,
            title=step_data.get("title", f"Step {order + 1}"),
            description=step_data.get("description"),
            order_index=order,
            estimated_minutes=step_data.get("estimated_minutes"),
        )
        db.add(parent)
        await db.flush()

        for sub_order, sub in enumerate(step_data.get("substeps", [])):
            db.add(VisionStep(
                board_id=board.id,
                title=sub.get("title", f"Sub-step {sub_order + 1}"),
                description=sub.get("description"),
                order_index=sub_order,
                parent_step_id=parent.id,
                estimated_minutes=sub.get("estimated_minutes"),
            ))

    await db.flush()
    await db.refresh(board)
    return await _board_detail(board, db)


@router.get("/boards", response_model=list[VisionBoardSummary])
async def list_boards(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    boards_result = await db.execute(
        select(VisionBoard)
        .where(VisionBoard.user_id == current_user.id)
        .order_by(VisionBoard.updated_at.desc())
    )
    boards = boards_result.scalars().all()

    counts_result = await db.execute(
        select(
            VisionStep.board_id,
            func.count(VisionStep.id).label("total"),
            func.count(VisionStep.id).filter(VisionStep.is_completed == True).label("done"),  # noqa: E712
        ).group_by(VisionStep.board_id)
    )
    counts = {row.board_id: (int(row.total), int(row.done or 0)) for row in counts_result}

    summaries = []
    for b in boards:
        total, done = counts.get(b.id, (0, 0))
        summaries.append(VisionBoardSummary(
            id=b.id,
            title=b.title,
            description=b.description,
            source_type=b.source_type,
            source_id=b.source_id,
            note_id=b.note_id,
            status=b.status,
            progress=b.progress,
            step_count=total,
            completed_steps=done,
            created_at=b.created_at,
            updated_at=b.updated_at,
        ))
    return summaries


@router.get("/boards/{board_id}", response_model=VisionBoardDetail)
async def get_board(
    board_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    board = await db.get(VisionBoard, board_id)
    _owned_board_or_404(board, current_user.id)
    return await _board_detail(board, db)


@router.put("/steps/{step_id}", response_model=VisionStepResponse)
async def update_step(
    step_id: int,
    body: UpdateVisionStepRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    step = await db.get(VisionStep, step_id)
    if not step:
        raise HTTPException(status_code=404, detail="Step not found.")
    board = await db.get(VisionBoard, step.board_id)
    _owned_board_or_404(board, current_user.id)

    if body.title is not None:
        step.title = body.title.strip() or step.title
    if body.description is not None:
        step.description = body.description
    if body.is_completed is not None:
        step.is_completed = body.is_completed
    if body.estimated_minutes is not None:
        step.estimated_minutes = body.estimated_minutes

    await db.flush()

    if board:
        await _sync_progress(board, db)
        await db.flush()

    await db.refresh(step)

    return VisionStepResponse(
        id=step.id,
        board_id=step.board_id,
        title=step.title,
        description=step.description,
        order_index=step.order_index,
        parent_step_id=step.parent_step_id,
        is_completed=step.is_completed,
        estimated_minutes=step.estimated_minutes,
        created_at=step.created_at,
        updated_at=step.updated_at,
    )


@router.post("/boards/{board_id}/add-step", response_model=VisionStepResponse, status_code=201)
async def add_step(
    board_id: int,
    body: AddVisionStepRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    board = await db.get(VisionBoard, board_id)
    _owned_board_or_404(board, current_user.id)

    if body.parent_step_id is not None:
        parent = await db.get(VisionStep, body.parent_step_id)
        if not parent or parent.board_id != board_id:
            raise HTTPException(status_code=404, detail="Parent step not found on this board.")

    if body.order_index is not None:
        order_index = body.order_index
    else:
        sibling_max = await db.scalar(
            select(func.max(VisionStep.order_index)).where(
                VisionStep.board_id == board_id,
                VisionStep.parent_step_id == body.parent_step_id,
            )
        )
        order_index = (sibling_max or -1) + 1

    step = VisionStep(
        board_id=board_id,
        title=body.title.strip(),
        description=body.description,
        order_index=order_index,
        parent_step_id=body.parent_step_id,
        estimated_minutes=body.estimated_minutes,
    )
    db.add(step)
    await db.flush()
    await db.refresh(step)

    return VisionStepResponse(
        id=step.id,
        board_id=step.board_id,
        title=step.title,
        description=step.description,
        order_index=step.order_index,
        parent_step_id=step.parent_step_id,
        is_completed=step.is_completed,
        estimated_minutes=step.estimated_minutes,
        created_at=step.created_at,
        updated_at=step.updated_at,
    )


@router.delete("/steps/{step_id}", status_code=204)
async def delete_step(
    step_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    step = await db.get(VisionStep, step_id)
    if not step:
        raise HTTPException(status_code=404, detail="Step not found.")
    board = await db.get(VisionBoard, step.board_id)
    _owned_board_or_404(board, current_user.id)

    board_id = step.board_id
    await db.delete(step)
    await db.flush()

    if board:
        await _sync_progress(board, db)
        await db.flush()


@router.post("/steps/{step_id}/ask")
async def ask_about_step(
    step_id: int,
    body: AskStepRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    step = await db.get(VisionStep, step_id)
    if not step:
        raise HTTPException(status_code=404, detail="Step not found.")
    board = await db.get(VisionBoard, step.board_id)
    _owned_board_or_404(board, current_user.id)

    all_steps = await _load_flat_steps(board.id, db)

    linked_note: Note | None = None
    if board.note_id:
        linked_note = await db.get(Note, board.note_id)

    lines: list[str] = [
        "You are StudyNerve AI. Direct, sharp, human — no corporate tone, no filler.",
        "A student is asking about a specific step in their assignment plan.",
        "You have the full assignment text — use it. Don't give generic advice.",
        "",
        f"ASSIGNMENT: {board.title}",
    ]

    if board.description and board.description.strip():
        lines += [
            "",
            "FULL ASSIGNMENT DESCRIPTION (this is the actual assignment text — "
            "read it carefully to answer questions about requirements, format, etc.):",
            board.description.strip()[:4000],
        ]

    if linked_note:
        lines += [
            "",
            f"STUDENT'S NOTES ON THIS MATERIAL — {linked_note.title}:",
            linked_note.content.strip()[:2000],
        ]

    if all_steps:
        lines += ["", "FULL STEP BREAKDOWN FOR THIS ASSIGNMENT:"]
        for s in all_steps:
            prefix = "    └─ " if s.parent_step_id else "  "
            done = "[✓]" if s.is_completed else "[ ]"
            mins = f" ({s.estimated_minutes} min)" if s.estimated_minutes else ""
            marker = " ← CURRENT STEP" if s.id == step.id else ""
            lines.append(f"{prefix}{done} {s.title}{mins}{marker}")

    lines += [
        "",
        f"CURRENT STEP THE STUDENT IS ASKING ABOUT: {step.title}",
    ]
    if step.description:
        lines.append(step.description)

    lines += [
        "",
        "RULES:",
        "- If they ask about requirements or format, pull them directly from the assignment description above",
        "- Be specific to THIS assignment — not generic advice",
        "- If they ask what the assignment is about, summarize from the description",
        "- Keep answers concise but complete — list all requirements if they ask for them",
        "- End with one targeted follow-up question tied to what they asked",
        "- If the assignment description doesn't have the info, say so honestly",
        "- Use markdown for lists and formatting when it helps clarity",
    ]

    system = "\n".join(lines)

    llm_kwargs = await get_user_llm_kwargs(db, current_user.id)
    answer = await generate_chat(
        [{"role": "user", "content": body.question}],
        system,
        **llm_kwargs,
    )
    if answer is None:
        raise HTTPException(status_code=502, detail="LLM unavailable or failed to respond.")

    return {"step_id": step_id, "question": body.question, "answer": answer}


@router.put("/boards/{board_id}/reorder")
async def reorder_steps(
    board_id: int,
    body: ReorderStepsRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    board = await db.get(VisionBoard, board_id)
    _owned_board_or_404(board, current_user.id)

    result = await db.execute(
        select(VisionStep).where(
            VisionStep.id.in_(body.step_ids),
            VisionStep.board_id == board_id,
        )
    )
    step_map = {s.id: s for s in result.scalars().all()}

    for new_index, step_id in enumerate(body.step_ids):
        if step_id in step_map:
            step_map[step_id].order_index = new_index

    await db.flush()
    return {"reordered": len(step_map), "board_id": board_id}
