from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import User
from app.routers.auth import get_current_user
from app.schemas import LearningStyleResponse, StudentInsightResponse
from app.services.learning_style import detect_learning_style
from app.services.memory import get_insights

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("/learning-style", response_model=LearningStyleResponse)
async def learning_style(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    profile = await detect_learning_style(db, user_id=current_user.id)
    return LearningStyleResponse(
        style=profile.style,
        pace=profile.pace,
        detail_level=profile.detail_level,
        confidence_note=profile.confidence_note,
        data_points=profile.data_points,
    )


@router.get("/insights", response_model=list[StudentInsightResponse])
async def student_insights(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_insights(db, user_id=current_user.id)
