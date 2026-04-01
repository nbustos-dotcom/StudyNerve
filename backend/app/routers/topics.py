from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Note, Topic, User
from app.routers.auth import get_current_user
from app.schemas import TopicResponse

router = APIRouter(prefix="/topics", tags=["topics"])


@router.get("", response_model=list[TopicResponse])
async def list_topics(
    note_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(Topic)
        .join(Note, Topic.note_id == Note.id)
        .where(Note.user_id == current_user.id)
        .order_by(Topic.created_at.desc())
    )
    if note_id is not None:
        query = query.where(Topic.note_id == note_id)
    result = await db.execute(query)
    return result.scalars().all()
