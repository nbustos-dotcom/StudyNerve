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

class CreateBoardRequest(BaseModel):
    title: str


class NodeResponse(BaseModel):
    id: int
    board_id: int
    title: str
    description: Optional[str]
    x_position: float
    y_position: float
    is_completed: bool
    parent_step_id: Optional[int]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class BoardSummary(BaseModel):
    id: int
    title: str
    is_ai_generated: bool
    node_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class BoardDetail(BaseModel):
    id: int
    title: str
    is_ai_generated: bool
    created_at: datetime
    updated_at: datetime
    nodes: list[NodeResponse] = []

    model_config = {"from_attributes": True}


class CreateNodeRequest(BaseModel):
    title: str
    x: float = 0.0
    y: float = 0.0
    parent_step_id: Optional[int] = None
    description: Optional[str] = None


class UpdateNodeRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    x: Optional[float] = None
    y: Optional[float] = None
    is_completed: Optional[bool] = None


class UpdateNodePositionRequest(BaseModel):
    x: float
    y: float


class ConnectNodesRequest(BaseModel):
    from_id: int
    to_id: int


class AskNodeRequest(BaseModel):
    question: str


class AiOrganizeSuggestion(BaseModel):
    id: int
    suggested_order: int
    group_name: Optional[str] = None


class AiMissingStep(BaseModel):
    title: str
    description: Optional[str] = None
    connect_after_id: Optional[int] = None


class AiOrganizeResponse(BaseModel):
    reordered: list[AiOrganizeSuggestion]
    missing_steps: list[AiMissingStep]


class AiSubtask(BaseModel):
    title: str
    description: Optional[str] = None


class AiBreakdownResponse(BaseModel):
    created_nodes: list[NodeResponse]


# ── User Settings ─────────────────────────────────────────────────────────────

class ProviderSettingsRequest(BaseModel):
    provider: str  # "ollama" | "gemini" | "openai" | "anthropic" | "groq"
    api_key: Optional[str] = None


class CanvasSettingsRequest(BaseModel):
    canvas_url: str
    canvas_token: str


class UserSettingsResponse(BaseModel):
    llm_provider: str
    llm_api_key_set: bool
    canvas_url: Optional[str]
    canvas_connected: bool


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
