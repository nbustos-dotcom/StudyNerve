"""
Canvas LMS integration service.

All functions that hit the Canvas REST API use an httpx async client with
Bearer auth.  HTML in assignment descriptions is stripped to plain text
using the standard-library html.parser — no extra dependency needed.
"""

import re
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Note


# ── HTML stripper ─────────────────────────────────────────────────────────────

class _Stripper(HTMLParser):
    def __init__(self):
        super().__init__()
        self._chunks: list[str] = []

    def handle_data(self, data: str) -> None:
        self._chunks.append(data)

    def text(self) -> str:
        raw = " ".join(self._chunks)
        # collapse runs of whitespace / blank lines
        raw = re.sub(r"[ \t]+", " ", raw)
        raw = re.sub(r"\n{3,}", "\n\n", raw)
        return raw.strip()


def _strip_html(html: str | None) -> str:
    if not html:
        return ""
    s = _Stripper()
    try:
        s.feed(html)
    except Exception:
        # fall back to a naive regex strip if the parser chokes
        return re.sub(r"<[^>]+>", " ", html).strip()
    return s.text()


# ── Canvas HTTP client factory ────────────────────────────────────────────────

def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        base_url=settings.CANVAS_API_URL.rstrip("/"),
        headers={"Authorization": f"Bearer {settings.CANVAS_API_TOKEN}"},
        timeout=20.0,
    )


# ── Shape helpers ─────────────────────────────────────────────────────────────

def _shape_course(raw: dict) -> dict:
    return {
        "id": raw["id"],
        "name": raw.get("name", ""),
        "code": raw.get("course_code", ""),
    }


def _shape_assignment(raw: dict, course_id: int | None = None) -> dict:
    return {
        "id": raw["id"],
        "course_id": course_id if course_id is not None else raw.get("course_id"),
        "name": raw.get("name", ""),
        "description": _strip_html(raw.get("description")),
        "due_at": raw.get("due_at"),
        "points_possible": raw.get("points_possible"),
        "submission_types": raw.get("submission_types", []),
    }


# ── Public API ────────────────────────────────────────────────────────────────

async def get_courses(db: AsyncSession | None = None) -> list[dict]:
    """Return all active enrolled courses: id, name, code."""
    async with _client() as c:
        resp = await c.get("/courses", params={"enrollment_state": "active", "per_page": 100})
        resp.raise_for_status()
    return [
        _shape_course(course)
        for course in resp.json()
        if isinstance(course, dict) and course.get("name")
    ]


async def get_assignments(course_id: int) -> list[dict]:
    """Return assignments for a course ordered by due date."""
    async with _client() as c:
        resp = await c.get(
            f"/courses/{course_id}/assignments",
            params={"order_by": "due_at", "per_page": 100},
        )
        resp.raise_for_status()
    return [
        _shape_assignment(a, course_id)
        for a in resp.json()
        if isinstance(a, dict) and a.get("id")
    ]


async def get_single_assignment(course_id: int, assignment_id: int) -> dict:
    """Fetch one assignment by ID."""
    async with _client() as c:
        resp = await c.get(f"/courses/{course_id}/assignments/{assignment_id}")
        resp.raise_for_status()
    return _shape_assignment(resp.json(), course_id)


async def get_upcoming_assignments(days: int = 14) -> list[dict]:
    """Return assignments due within the next *days* days across all active courses."""
    now = datetime.now(timezone.utc)
    cutoff = now + timedelta(days=days)

    courses = await get_courses()
    upcoming: list[dict] = []

    for course in courses:
        try:
            assignments = await get_assignments(course["id"])
        except httpx.HTTPStatusError:
            continue  # skip courses we can't access

        for a in assignments:
            due_str = a.get("due_at")
            if not due_str:
                continue
            try:
                due_dt = datetime.fromisoformat(due_str.replace("Z", "+00:00"))
            except ValueError:
                continue
            if now <= due_dt <= cutoff:
                a["course_name"] = course["name"]
                upcoming.append(a)

    upcoming.sort(key=lambda a: a.get("due_at") or "")
    return upcoming


async def import_assignment_as_note(
    db: AsyncSession,
    assignment: dict,
    course_name: str = "",
) -> Note:
    """
    Create a Note from a Canvas assignment dict.
    The note title = assignment name; content = due date + points + description.
    Subject = course name.
    """
    parts: list[str] = []

    if assignment.get("due_at"):
        parts.append(f"Due: {assignment['due_at']}")
    if assignment.get("points_possible") is not None:
        parts.append(f"Points: {assignment['points_possible']}")
    if assignment.get("submission_types"):
        types = ", ".join(assignment["submission_types"])
        parts.append(f"Submission: {types}")

    description = assignment.get("description", "").strip()
    if description:
        parts.append(description)

    content = "\n\n".join(parts) if parts else assignment.get("name", "Canvas Assignment")

    note = Note(
        title=assignment.get("name", "Canvas Assignment"),
        content=content,
        subject=course_name or None,
    )
    db.add(note)
    await db.flush()
    await db.refresh(note)
    return note


async def sync_courses(db: AsyncSession) -> dict:
    """
    Import all assignments from all active courses as notes.
    Returns a summary dict.
    """
    courses = await get_courses()
    total_imported = 0
    details: list[dict] = []

    for course in courses:
        try:
            assignments = await get_assignments(course["id"])
        except httpx.HTTPStatusError as exc:
            details.append({"course": course["name"], "error": str(exc)})
            continue

        count = 0
        for a in assignments:
            await import_assignment_as_note(db, a, course_name=course["name"])
            count += 1

        total_imported += count
        details.append({"course": course["name"], "assignments_imported": count})

    return {
        "courses_synced": len(courses),
        "total_imported": total_imported,
        "details": details,
    }
