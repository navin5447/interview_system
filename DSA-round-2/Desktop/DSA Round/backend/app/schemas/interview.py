from pydantic import BaseModel, field_validator
from typing import List, Optional, Dict
from datetime import datetime


class DifficultyDistribution(BaseModel):
    easy: int = 0
    medium: int = 0
    hard: int = 0

    @field_validator('easy', 'medium', 'hard')
    @classmethod
    def validate_non_negative(cls, v):
        if v < 0:
            raise ValueError('Count must be non-negative')
        return v


class InterviewCreate(BaseModel):
    total_questions: int
    difficulty_distribution: DifficultyDistribution
    duration_minutes: int = 60
    candidate_id: Optional[str] = None

    @field_validator('total_questions')
    @classmethod
    def validate_total(cls, v, info):
        if v <= 0:
            raise ValueError('Total questions must be positive')
        return v

    @field_validator('duration_minutes')
    @classmethod
    def validate_duration(cls, v):
        if v < 5 or v > 180:
            raise ValueError('Duration must be between 5 and 180 minutes')
        return v


class InterviewStart(BaseModel):
    interview_id: str


class QuestionSummary(BaseModel):
    id: int
    title: str
    difficulty: str


class InterviewResponse(BaseModel):
    interview_id: str
    questions: List[QuestionSummary]
    start_time: datetime
    end_time: datetime
    duration_minutes: int
    status: str

    class Config:
        from_attributes = True


class InterviewStatusResponse(BaseModel):
    interview_id: str
    status: str
    start_time: Optional[datetime]
    end_time: Optional[datetime]
    time_remaining_seconds: Optional[int]
    questions_count: int
    submitted_count: int
