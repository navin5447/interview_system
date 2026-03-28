from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class ResumeParsedData(BaseModel):
    name: str | None = None
    summary: str
    skills: list[str] = Field(default_factory=list)
    experience_years: float | None = None
    raw_text: str


class QuestionItem(BaseModel):
    id: str
    question: str
    type: str
    difficulty: str
    expected_keywords: list[str] = Field(default_factory=list)
    expected_answer: str | None = None
    rubric: str | None = None
    assessment_focus: str | None = None


class StartSessionRequest(BaseModel):
    resume_id: str
    role: str
    candidate_name: str = ""
    interview_stage: str = "Technical Round"
    conversation_history: list[dict[str, str]] = Field(default_factory=list)
    hr_prompt: str = ""
    resume_summary: str = ""
    resume_skills: list[str] = Field(default_factory=list)
    resume_raw_text: str = ""
    scenario_percentage: int = Field(default=35, ge=0, le=100)
    resume_validation_percentage: int = Field(default=25, ge=0, le=100)
    total_questions: int = Field(default=5, ge=5, le=5)


class StartSessionResponse(BaseModel):
    session_id: str
    questions: list[QuestionItem]


class AnalyzeFrameRequest(BaseModel):
    session_id: str
    image_base64: str


class EmotionResult(BaseModel):
    emotion: str
    confidence: float
    timestamp: datetime


class EvaluateRequest(BaseModel):
    session_id: str
    question_id: str
    question: str
    transcript: str
    keywords: list[str]
    question_type: str = ""
    assessment_focus: str = ""
    response_time_seconds: float = 0.0
    dead_end_time_seconds: float = 0.0


class EvaluateResponse(BaseModel):
    scores: dict[str, Any]
    feedback: str
    follow_up: str


class EndSessionRequest(BaseModel):
    session_id: str


class NextQuestionRequest(BaseModel):
    session_id: str
    current_question_id: str


class NextQuestionResponse(BaseModel):
    question: QuestionItem | None = None
    done: bool = False
    total_questions: int = 5


class TranscriptResponse(BaseModel):
    transcript: str
    words_per_minute: float
    filler_word_count: int
