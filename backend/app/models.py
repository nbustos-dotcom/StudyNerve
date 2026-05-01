import enum
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )


class Note(Base):
    __tablename__ = "notes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    subject: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )
    study_guide: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    topics: Mapped[list["Topic"]] = relationship(
        "Topic", back_populates="note", cascade="all, delete-orphan"
    )
    questions: Mapped[list["Question"]] = relationship(
        "Question", back_populates="note", cascade="all, delete-orphan"
    )


class Topic(Base):
    __tablename__ = "topics"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    subject: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    note_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("notes.id", ondelete="CASCADE"), nullable=False
    )
    parent_topic_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("topics.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )

    note: Mapped["Note"] = relationship("Note", back_populates="topics")
    parent: Mapped[Optional["Topic"]] = relationship(
        "Topic", back_populates="children", remote_side="Topic.id"
    )
    children: Mapped[list["Topic"]] = relationship(
        "Topic", back_populates="parent", cascade="all, delete-orphan"
    )
    questions: Mapped[list["Question"]] = relationship(
        "Question", back_populates="topic", cascade="all, delete-orphan"
    )


class Question(Base):
    __tablename__ = "questions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    topic_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("topics.id", ondelete="CASCADE"), nullable=False
    )
    note_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("notes.id", ondelete="CASCADE"), nullable=False
    )
    type: Mapped[str] = mapped_column(String(20), nullable=False)  # "mcq" | "short_answer"
    content: Mapped[str] = mapped_column(Text, nullable=False)
    options: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON string for MCQ
    correct_answer: Mapped[str] = mapped_column(Text, nullable=False)
    explanation: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    difficulty: Mapped[int] = mapped_column(Integer, default=3)  # 1-5
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )

    topic: Mapped["Topic"] = relationship("Topic", back_populates="questions")
    note: Mapped["Note"] = relationship("Note", back_populates="questions")
    attempts: Mapped[list["Attempt"]] = relationship(
        "Attempt", back_populates="question", cascade="all, delete-orphan"
    )


class Attempt(Base):
    __tablename__ = "attempts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    question_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("questions.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    user_answer: Mapped[str] = mapped_column(Text, nullable=False)
    is_correct: Mapped[bool] = mapped_column(Boolean, nullable=False)
    time_taken_seconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )

    question: Mapped["Question"] = relationship("Question", back_populates="attempts")


class StudySession(Base):
    __tablename__ = "study_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )
    ended_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    total_questions: Mapped[int] = mapped_column(Integer, default=0)
    correct_answers: Mapped[int] = mapped_column(Integer, default=0)
    topics_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON list of topic ids/names


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False)  # "user" | "assistant"
    content: Mapped[str] = mapped_column(Text, nullable=False)
    file_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    session_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )


class StudentInsight(Base):
    __tablename__ = "student_insights"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    session_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    insight: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(String(50), nullable=False)  # "learning_pattern" | "misconception" | "preference" | "strength"
    topic_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


class Flashcard(Base):
    __tablename__ = "flashcards"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    note_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("notes.id", ondelete="CASCADE"), nullable=True, index=True
    )
    front: Mapped[str] = mapped_column(Text, nullable=False)
    back: Mapped[str] = mapped_column(Text, nullable=False)
    difficulty: Mapped[str] = mapped_column(String(10), nullable=False, default="medium")  # easy/medium/hard
    times_reviewed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_reviewed: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )


class VisionBoard(Base):
    __tablename__ = "vision_boards"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # "canvas_assignment" | "manual"
    source_type: Mapped[str] = mapped_column(String(30), nullable=False, default="manual")
    # Canvas assignment ID when source_type == "canvas_assignment"
    source_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    # Linked note (optional)
    note_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("notes.id", ondelete="SET NULL"), nullable=True
    )
    # "active" | "completed"
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    # Cached progress 0–100, updated whenever steps are toggled
    progress: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_ai_generated: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    steps: Mapped[list["VisionStep"]] = relationship(
        "VisionStep",
        back_populates="board",
        cascade="all, delete-orphan",
        order_by="VisionStep.order_index",
        foreign_keys="[VisionStep.board_id]",
    )
    note: Mapped[Optional["Note"]] = relationship("Note")


class UserSettings(Base):
    __tablename__ = "user_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    llm_provider: Mapped[str] = mapped_column(String(30), nullable=False, default=lambda: __import__('os').getenv("LLM_PROVIDER", "ollama"))
    llm_api_key: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    canvas_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    canvas_token: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class VisionStep(Base):
    __tablename__ = "vision_steps"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    board_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("vision_boards.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # 0-based position among siblings (same parent_step_id)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Nullable self-FK enables branching sub-steps
    parent_step_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("vision_steps.id", ondelete="CASCADE"), nullable=True
    )
    is_completed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    estimated_minutes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    x_position: Mapped[Optional[float]] = mapped_column(Float, nullable=True, default=0.0)
    y_position: Mapped[Optional[float]] = mapped_column(Float, nullable=True, default=0.0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    board: Mapped["VisionBoard"] = relationship(
        "VisionBoard", back_populates="steps", foreign_keys=[board_id]
    )
    parent: Mapped[Optional["VisionStep"]] = relationship(
        "VisionStep",
        back_populates="children",
        remote_side="VisionStep.id",
        foreign_keys="[VisionStep.parent_step_id]",
    )
    children: Mapped[list["VisionStep"]] = relationship(
        "VisionStep",
        back_populates="parent",
        cascade="all, delete-orphan",
        order_by="VisionStep.order_index",
        foreign_keys="[VisionStep.parent_step_id]",
    )


class QuizResult(Base):
    __tablename__ = "quiz_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    note_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("notes.id", ondelete="SET NULL"), nullable=True
    )
    note_title: Mapped[str] = mapped_column(String(255), nullable=False)
    score: Mapped[int] = mapped_column(Integer, nullable=False)
    total_questions: Mapped[int] = mapped_column(Integer, nullable=False)
    questions_json: Mapped[str] = mapped_column(Text, nullable=False)  # JSON array
    completed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )


class VisionBoardSnapshot(Base):
    __tablename__ = "vision_board_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    board_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("vision_boards.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Full serialized board steps as JSON text
    snapshot_data: Mapped[str] = mapped_column(Text, nullable=False)
    # Human-readable description of what triggered this snapshot
    action_description: Mapped[str] = mapped_column(String(500), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )


# ── Workflow nodes ─────────────────────────────────────────────────────────────

class NodeType(str, enum.Enum):
    chatgpt_text = "chatgpt_text"
    chatgpt_image = "chatgpt_image"
    claude_text = "claude_text"
    gemini_text = "gemini_text"
    gemini_image = "gemini_image"
    meshy_3d = "meshy_3d"
    stability_image = "stability_image"
    internal_quiz = "internal_quiz"
    internal_flashcard = "internal_flashcard"
    internal_summary = "internal_summary"


class NodeStatus(str, enum.Enum):
    pending = "pending"
    running = "running"
    done = "done"
    failed = "failed"
    skipped = "skipped"


class RunStatus(str, enum.Enum):
    planning = "planning"
    awaiting_confirmation = "awaiting_confirmation"
    running = "running"
    done = "done"
    failed = "failed"


class WorkflowNode(Base):
    __tablename__ = "workflow_nodes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    vision_board_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("vision_boards.id", ondelete="CASCADE"), nullable=False, index=True
    )
    node_order: Mapped[int] = mapped_column(Integer, nullable=False)
    # One of the NodeType enum values stored as a plain string
    node_type: Mapped[str] = mapped_column(String(30), nullable=False)
    prompt: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    provider: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    model: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    # Optional FK to the upstream node whose output feeds into this node
    input_from_node_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("workflow_nodes.id", ondelete="SET NULL"), nullable=True
    )
    # Stores the provider result: {"type": "text"|"image"|"3d", "content": ..., "metadata": {...}}
    output_data: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    # One of the NodeStatus enum values
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


class WorkflowRun(Base):
    __tablename__ = "workflow_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    vision_board_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("vision_boards.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # JSON plan produced by plan_workflow — see workflow_engine.py for shape
    plan: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    # One of the RunStatus enum values
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="planning")
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
