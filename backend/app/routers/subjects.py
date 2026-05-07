from collections import Counter

from fastapi import APIRouter, Depends
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.llm import suggest_subject_merges
from app.models import Note, User
from app.routers.auth import get_current_user
from app.routers.settings import get_user_llm_kwargs
from app.schemas import MergeSubjectRequest
from app.services.subjects import get_subject_list, normalize_subject

router = APIRouter(prefix="/subjects", tags=["subjects"])


@router.get("/list")
async def list_subjects() -> list[str]:
    return get_subject_list()


@router.get("/needs-normalization")
async def needs_normalization(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(
        select(Note.subject).where(Note.user_id == current_user.id).where(Note.subject.isnot(None))
    )
    subjects = result.scalars().all()
    count = sum(1 for s in subjects if normalize_subject(s) != s)
    return {"count": count, "needs": count > 0}


@router.post("/normalize-all")
async def normalize_all_subjects(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(
        select(Note).where(Note.user_id == current_user.id).where(Note.subject.isnot(None))
    )
    notes = result.scalars().all()

    updated = 0
    for note in notes:
        normalized = normalize_subject(note.subject)
        if normalized != note.subject:
            note.subject = normalized
            updated += 1

    return {"updated": updated}


@router.post("/suggest-merges")
async def suggest_merges(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list:
    result = await db.execute(
        select(Note.subject)
        .where(Note.user_id == current_user.id)
        .where(Note.subject.isnot(None))
    )
    all_subjects = result.scalars().all()
    distinct = set(all_subjects)
    if len(distinct) < 2:
        return []

    counts = Counter(all_subjects)
    subjects_text = "\n".join(
        f"- {s} ({counts[s]} {'note' if counts[s] == 1 else 'notes'})"
        for s in sorted(distinct)
    )
    llm_kwargs = await get_user_llm_kwargs(db, current_user.id)
    llm_result = await suggest_subject_merges(subjects_text, **llm_kwargs)
    if not llm_result:
        return []
    return llm_result.get("groups", [])


@router.put("/merge")
async def merge_subjects(
    body: MergeSubjectRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(
        update(Note)
        .where(Note.user_id == current_user.id)
        .where(Note.subject == body.from_subject)
        .values(subject=body.to_subject)
    )
    return {"updated": result.rowcount}
