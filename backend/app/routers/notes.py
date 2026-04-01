from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.llm import extract_topics
from app.models import Note, Topic, User
from app.routers.auth import get_current_user
from app.schemas import NoteCreate, NoteResponse

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

    llm_result = await extract_topics(note.content)
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

    return {"created": created_count}
