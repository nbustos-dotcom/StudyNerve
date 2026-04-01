"""
Canvas LMS router.

Endpoints:
  GET  /api/canvas/status                      — check connection
  GET  /api/canvas/courses                     — list active courses
  GET  /api/canvas/courses/{id}/assignments    — list assignments for a course
  GET  /api/canvas/upcoming                    — assignments due within N days
  POST /api/canvas/import/{assignment_id}      — import one assignment as a note
  POST /api/canvas/sync                        — bulk import all courses
  POST /api/canvas/settings                    — save Canvas URL + token to .env
"""

import os

import httpx
from dotenv import set_key
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import _ENV_FILE, settings
from app.database import get_db
from app.models import User
from app.routers.auth import get_current_user
from app.schemas import NoteResponse
from app.services import canvas as svc

router = APIRouter(prefix="/canvas", tags=["canvas"])


# ── Request / response bodies ─────────────────────────────────────────────────

class CanvasSettingsRequest(BaseModel):
    canvas_url: str
    canvas_token: str


# ── Helpers ───────────────────────────────────────────────────────────────────

def _require_token() -> None:
    if not settings.CANVAS_API_TOKEN:
        raise HTTPException(
            status_code=400,
            detail="Canvas API token not configured. POST /api/canvas/settings first.",
        )


def _http_error(exc: httpx.HTTPStatusError) -> HTTPException:
    if exc.response.status_code == 401:
        return HTTPException(status_code=401, detail="Canvas token is invalid or expired.")
    if exc.response.status_code == 404:
        return HTTPException(status_code=404, detail="Canvas resource not found.")
    return HTTPException(status_code=502, detail=f"Canvas API error: {exc.response.status_code}")


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/status")
async def canvas_status(current_user: User = Depends(get_current_user)):
    if not settings.CANVAS_API_TOKEN:
        return {"connected": False, "reason": "token not configured"}
    try:
        courses = await svc.get_courses()
        return {"connected": True, "courses_visible": len(courses)}
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 401:
            return {"connected": False, "reason": "invalid token"}
        return {"connected": False, "reason": f"canvas returned {exc.response.status_code}"}
    except httpx.RequestError:
        return {"connected": False, "reason": "could not reach Canvas"}


@router.get("/courses")
async def list_courses(current_user: User = Depends(get_current_user)):
    _require_token()
    try:
        return await svc.get_courses()
    except httpx.HTTPStatusError as exc:
        raise _http_error(exc)
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="Could not reach Canvas.")


@router.get("/courses/{course_id}/assignments")
async def list_assignments(
    course_id: int,
    current_user: User = Depends(get_current_user),
):
    _require_token()
    try:
        return await svc.get_assignments(course_id)
    except httpx.HTTPStatusError as exc:
        raise _http_error(exc)
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="Could not reach Canvas.")


@router.get("/upcoming")
async def upcoming_assignments(
    days: int = Query(default=14, ge=1, le=90),
    current_user: User = Depends(get_current_user),
):
    _require_token()
    try:
        return await svc.get_upcoming_assignments(days=days)
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
    _require_token()
    try:
        assignment = await svc.get_single_assignment(course_id, assignment_id)
    except httpx.HTTPStatusError as exc:
        raise _http_error(exc)
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="Could not reach Canvas.")

    course_name = ""
    try:
        courses = await svc.get_courses()
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
    _require_token()
    try:
        result = await svc.sync_courses(db, user_id=current_user.id)
    except httpx.HTTPStatusError as exc:
        raise _http_error(exc)
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="Could not reach Canvas.")
    return result


@router.post("/settings")
async def save_settings(
    body: CanvasSettingsRequest,
    current_user: User = Depends(get_current_user),
):
    url = body.canvas_url.strip().rstrip("/")
    token = body.canvas_token.strip()

    if not url:
        raise HTTPException(status_code=422, detail="canvas_url must not be empty.")

    set_key(str(_ENV_FILE), "CANVAS_API_URL", url)
    set_key(str(_ENV_FILE), "CANVAS_API_TOKEN", token)

    os.environ["CANVAS_API_URL"] = url
    os.environ["CANVAS_API_TOKEN"] = token

    settings.CANVAS_API_URL = url
    settings.CANVAS_API_TOKEN = token

    return {"status": "saved", "canvas_url": url}
