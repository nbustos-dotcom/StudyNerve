import io
import os

from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.llm import extract_topics
from app.models import Note, Topic, User
from app.providers.base import LLMTokenLimitError
from app.routers.auth import get_current_user
from app.routers.settings import get_user_llm_kwargs
from app.schemas import NoteCreate, NoteResponse

_MAX_UPLOAD_BYTES = 5 * 1024 * 1024  # 5 MB

_MAX_NOTE_CHARS = 3000

router = APIRouter(prefix="/notes", tags=["notes"])


@router.post("", response_model=NoteResponse, status_code=201)
async def create_note(
    body: NoteCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    note = Note(**body.model_dump(), user_id=current_user.id)
    db.add(note)
    await db.flush()
    await db.refresh(note)
    return note


@router.post("/upload", response_model=NoteResponse, status_code=201)
async def upload_note(
    file: UploadFile,
    title: str | None = Form(default=None),
    subject: str | None = Form(default=None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    filename = file.filename or ""
    ext = os.path.splitext(filename)[1].lower()
    if ext not in (".txt", ".pdf"):
        raise HTTPException(status_code=400, detail="Only .txt and .pdf files are supported.")

    raw = await file.read()
    if len(raw) > _MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds 5 MB limit.")

    if ext == ".txt":
        try:
            content = raw.decode("utf-8")
        except UnicodeDecodeError:
            content = raw.decode("latin-1")
    else:
        try:
            import PyPDF2  # noqa: PLC0415
        except ImportError:
            raise HTTPException(status_code=500, detail="PyPDF2 is not installed on the server.")
        reader = PyPDF2.PdfReader(io.BytesIO(raw))
        pages = [page.extract_text() or "" for page in reader.pages]
        content = "\n\n".join(pages).strip()
        if not content:
            raise HTTPException(status_code=422, detail="Could not extract text from PDF.")

    note_title = (title.strip() if title and title.strip() else None) or os.path.splitext(filename)[0]
    note = Note(
        title=note_title,
        content=content,
        subject=subject.strip() if subject and subject.strip() else None,
        user_id=current_user.id,
    )
    db.add(note)
    await db.flush()
    await db.refresh(note)
    return note


@router.get("", response_model=list[NoteResponse])
async def list_notes(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Note)
        .where(Note.user_id == current_user.id)
        .order_by(Note.created_at.desc())
    )
    return result.scalars().all()


@router.get("/{note_id}", response_model=NoteResponse)
async def get_note(
    note_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    note = await db.get(Note, note_id)
    if not note or note.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Note not found")
    return note


@router.delete("/{note_id}", status_code=204)
async def delete_note(
    note_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    note = await db.get(Note, note_id)
    if not note or note.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Note not found")
    await db.delete(note)


@router.post("/{note_id}/extract-topics")
async def extract_note_topics(
    note_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    note = await db.get(Note, note_id)
    if not note or note.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Note not found")

    content = note.content
    was_truncated = len(content) > _MAX_NOTE_CHARS
    if was_truncated:
        content = content[:_MAX_NOTE_CHARS]

    llm_kwargs = await get_user_llm_kwargs(db, current_user.id)
    try:
        llm_result = await extract_topics(content, **llm_kwargs)
    except LLMTokenLimitError as exc:
        raise HTTPException(status_code=422, detail=exc.message)
    if llm_result is None:
        raise HTTPException(
            status_code=502, detail="LLM unavailable or failed to extract topics"
        )

    topics_data = llm_result.get("topics", [])
    created_count = 0

    for topic_data in topics_data:
        parent = Topic(
            name=topic_data.get("name", "Unnamed Topic"),
            subject=topic_data.get("subject") or note.subject,
            note_id=note_id,
            parent_topic_id=None,
        )
        db.add(parent)
        await db.flush()
        created_count += 1

        for subtopic_name in topic_data.get("subtopics", []):
            db.add(
                Topic(
                    name=subtopic_name,
                    subject=topic_data.get("subject") or note.subject,
                    note_id=note_id,
                    parent_topic_id=parent.id,
                )
            )
            created_count += 1

    result: dict = {"created": created_count}
    if was_truncated:
        result["warning"] = "Large note — topics extracted from the first section."
    return result
