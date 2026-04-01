from datetime import datetime
from typing import Optional

from pydantic import BaseModel


# ── Auth ──────────────────────────────────────────────────────────────────────

class UserLogin(BaseModel):
    email: str
    password: str


class UserCreate(BaseModel):
    email: str
    password: str
    name: str


class UserResponse(BaseModel):
    id: int
    email: str
    name: str
    created_at: datetime

    model_config = {"from_attributes": True}


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


# ── Notes ────────────────────────────────────────────────────────────────────

class NoteCreate(BaseModel):
    title: str
    content: str
    subject: Optional[str] = None


class NoteResponse(BaseModel):
    id: int
    title: str
    content: str
    subject: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Topics ───────────────────────────────────────────────────────────────────

class TopicResponse(BaseModel):
    id: int
    name: str
    subject: Optional[str]
    note_id: int
    parent_topic_id: Optional[int]
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Questions ────────────────────────────────────────────────────────────────

class QuizGenerateRequest(BaseModel):
    note_id: int
    num_questions: int = 5
    difficulty: Optional[int] = None  # 1-5; None means mixed
    question_types: list[str] = ["mcq", "short_answer"]


class QuestionResponse(BaseModel):
    id: int
    topic_id: int
    note_id: int
    type: str
    content: str
    options: Optional[str]  # JSON string
    correct_answer: str
    explanation: Optional[str]
    difficulty: int
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Attempts ─────────────────────────────────────────────────────────────────

class AnswerSubmit(BaseModel):
    question_id: int
    user_answer: str
    time_taken_seconds: Optional[int] = None


class AnswerResult(BaseModel):
    is_correct: bool
    correct_answer: str
    explanation: Optional[str]
    attempt_id: int


# ── Sessions ─────────────────────────────────────────────────────────────────

class SessionResponse(BaseModel):
    id: int
    started_at: datetime
    ended_at: Optional[datetime]
    total_questions: int
    correct_answers: int
    topics_json: Optional[str]

    model_config = {"from_attributes": True}


# ── Stats ────────────────────────────────────────────────────────────────────

class TopicAccuracy(BaseModel):
    topic_id: int
    topic_name: str
    total_attempts: int
    correct_attempts: int
    accuracy: float  # 0.0 – 1.0


class OverviewStats(BaseModel):
    total_notes: int
    total_questions: int
    total_attempts: int
    overall_accuracy: float
    topic_accuracies: list[TopicAccuracy]


# ── Gap detection ─────────────────────────────────────────────────────────────

class TopicGapScoreResponse(BaseModel):
    topic_id: int
    topic_name: str
    note_id: int
    total_attempts: int
    accuracy: float
    recency_weight: float
    frequency_factor: float
    gap_score: float


class AdaptiveQuizRequest(BaseModel):
    note_id: int
    count: int = 5


# ── Chat ──────────────────────────────────────────────────────────────────────

class ChatSendRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    note_id: Optional[int] = None
    question_id: Optional[int] = None


class ChatSendResponse(BaseModel):
    session_id: str
    response: str
    role: str = "assistant"


class ChatMessageResponse(BaseModel):
    id: int
    role: str
    content: str
    session_id: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ChatSessionPreview(BaseModel):
    session_id: str
    preview: str      # first message content, truncated
    started_at: datetime
    message_count: int
    last_activity: datetime


# ── Learning profile ──────────────────────────────────────────────────────────

class LearningStyleResponse(BaseModel):
    style: str          # "visual" | "step-by-step" | "example-led" | "conceptual"
    pace: str           # "fast" | "moderate" | "thorough"
    detail_level: str   # "concise" | "balanced" | "detailed"
    confidence_note: str
    data_points: int


# ── Student insights ──────────────────────────────────────────────────────────

class StudentInsightResponse(BaseModel):
    id: int
    insight: str
    category: str
    topic_name: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Vision Board ─────────────────────────────────────────────────────────────

class CreateVisionBoardRequest(BaseModel):
    # Manual creation
    title: Optional[str] = None
    description: Optional[str] = None
    # Optional note to link (manual boards) — its content seeds the LLM breakdown
    note_id: Optional[int] = None
    # Canvas import — both required when used
    canvas_assignment_id: Optional[int] = None
    canvas_course_id: Optional[int] = None


class UpdateVisionStepRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    is_completed: Optional[bool] = None
    estimated_minutes: Optional[int] = None


class AddVisionStepRequest(BaseModel):
    title: str
    description: Optional[str] = None
    parent_step_id: Optional[int] = None
    order_index: Optional[int] = None
    estimated_minutes: Optional[int] = None


class ReorderStepsRequest(BaseModel):
    step_ids: list[int]  # ordered list — position in list = new order_index


class AskStepRequest(BaseModel):
    question: str


class VisionStepResponse(BaseModel):
    id: int
    board_id: int
    title: str
    description: Optional[str]
    order_index: int
    parent_step_id: Optional[int]
    is_completed: bool
    estimated_minutes: Optional[int]
    created_at: datetime
    updated_at: datetime
    substeps: list["VisionStepResponse"] = []

    model_config = {"from_attributes": True}


# Pydantic v2 requires an explicit rebuild for self-referential models
VisionStepResponse.model_rebuild()


class VisionBoardSummary(BaseModel):
    id: int
    title: str
    description: Optional[str]
    source_type: str
    source_id: Optional[int]
    note_id: Optional[int]
    status: str
    progress: int
    step_count: int = 0
    completed_steps: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class VisionBoardDetail(BaseModel):
    id: int
    title: str
    description: Optional[str]
    source_type: str
    source_id: Optional[int]
    note_id: Optional[int]
    status: str
    progress: int
    created_at: datetime
    updated_at: datetime
    steps: list[VisionStepResponse] = []

    model_config = {"from_attributes": True}


# ── Teach Back ────────────────────────────────────────────────────────────────

class TeachBackRequest(BaseModel):
    topic_id: Optional[int] = None
    topic_name: Optional[str] = None
    note_id: Optional[int] = None


class TeachBackPromptResponse(BaseModel):
    topic_name: str
    question_id: int
    prompt: str


class EvaluateTeachingRequest(BaseModel):
    topic_name: str
    student_explanation: str
    note_id: Optional[int] = None
    question_id: Optional[int] = None


class TeachingEvaluationResponse(BaseModel):
    score: int
    covered: list[str]
    missed: list[str]
    incorrect: list[str]
    feedback: str
    attempt_id: int
    is_correct: bool  # score >= 7
