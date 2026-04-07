"""
Canvas LMS router.

Endpoints:
  GET  /api/canvas/status                      — check connection
  GET  /api/canvas/courses                     — list active courses
  GET  /api/canvas/courses/{id}/assignments    — list assignments for a course
  GET  /api/canvas/upcoming                    — assignments due within N days
  POST /api/canvas/import/{assignment_id}      — import one assignment as a note
  POST /api/canvas/sync                        — bulk import all courses
  POST /api/canvas/settings                    — save Canvas URL + token (global env)
"""

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import User
from app.routers.auth import get_current_user
from app.routers.settings import get_user_canvas_creds
from app.schemas import NoteResponse
from app.services import canvas as svc

router = APIRouter(prefix="/canvas", tags=["canvas"])


# ── Request body ──────────────────────────────────────────────────────────────

class CanvasSettingsRequest(BaseModel):
    canvas_url: str
    canvas_token: str


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _creds(db: AsyncSession, user_id: int) -> tuple[str, str]:
    """Get per-user Canvas credentials; raise 400 if token is missing."""
    url, token = await get_user_canvas_creds(db, user_id)
    if not token:
        raise HTTPException(
            status_code=400,
            detail="Canvas API token not configured. Go to Settings → Canvas LMS.",
        )
    return url, token


def _http_error(exc: httpx.HTTPStatusError) -> HTTPException:
    if exc.response.status_code == 401:
        return HTTPException(status_code=401, detail="Canvas token is invalid or expired.")
    if exc.response.status_code == 404:
        return HTTPException(status_code=404, detail="Canvas resource not found.")
    return HTTPException(status_code=502, detail=f"Canvas API error: {exc.response.status_code}")


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/status")
async def canvas_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    url, token = await get_user_canvas_creds(db, current_user.id)
    if not token:
        return {"connected": False, "reason": "token not configured"}
    ok, msg = await svc.validate_connection(url, token)
    if ok:
        try:
            courses = await svc.get_courses(url, token)
            return {"connected": True, "courses_visible": len(courses)}
        except Exception:
            pass
    return {"connected": False, "reason": msg}


@router.get("/courses")
async def list_courses(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    url, token = await _creds(db, current_user.id)
    try:
        return await svc.get_courses(url, token)
    except httpx.HTTPStatusError as exc:
        raise _http_error(exc)
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="Could not reach Canvas.")


@router.get("/courses/{course_id}/assignments")
async def list_assignments(
    course_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    url, token = await _creds(db, current_user.id)
    try:
        return await svc.get_assignments(course_id, url, token)
    except httpx.HTTPStatusError as exc:
        raise _http_error(exc)
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="Could not reach Canvas.")


@router.get("/upcoming")
async def upcoming_assignments(
    days: int = Query(default=14, ge=1, le=90),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    url, token = await _creds(db, current_user.id)
    try:
        return await svc.get_upcoming_assignments(url, token, days=days)
    except httpx.HTTPStatusError as exc:
        raise _http_error(exc)
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="Could not reach Canvas.")


@router.post("/import/{assignment_id}", response_model=NoteResponse, status_code=201)
async def import_assignment(
    assignment_id: int,
    course_id: int = Query(..., description="Canvas course ID the assignment belongs to"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    url, token = await _creds(db, current_user.id)
    try:
        assignment = await svc.get_single_assignment(course_id, assignment_id, url, token)
    except httpx.HTTPStatusError as exc:
        raise _http_error(exc)
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="Could not reach Canvas.")

    course_name = ""
    try:
        courses = await svc.get_courses(url, token)
        match = next((c for c in courses if c["id"] == course_id), None)
        if match:
            course_name = match["name"]
    except Exception:
        pass

    note = await svc.import_assignment_as_note(
        db, assignment, course_name=course_name, user_id=current_user.id
    )
    return note


@router.post("/sync")
async def sync_all(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    url, token = await _creds(db, current_user.id)
    try:
        result = await svc.sync_courses(db, url, token, user_id=current_user.id)
    except httpx.HTTPStatusError as exc:
        raise _http_error(exc)
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="Could not reach Canvas.")
    return result


@router.post("/settings")
async def save_settings(
    body: CanvasSettingsRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Legacy canvas settings endpoint — delegates to /api/settings/canvas
    so per-user DB row is always updated.
    """
    import re
    from app.routers.settings import _get_or_create_settings
    from app.config import settings as _cfg

    url = re.sub(r"/api/v\d+/?$", "", body.canvas_url.strip()).rstrip("/")
    token = body.canvas_token.strip()

    if not url:
        raise HTTPException(status_code=422, detail="canvas_url must not be empty.")

    row = await _get_or_create_settings(db, current_user.id)
    row.canvas_url = url
    row.canvas_token = token or None
    await db.flush()

    ok, msg = await svc.validate_connection(url, token) if token else (False, "no token")
    return {
        "status": "saved",
        "canvas_url": url,
        "canvas_connected": ok,
        "validation": msg,
    }
