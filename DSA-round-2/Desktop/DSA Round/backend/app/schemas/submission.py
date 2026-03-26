from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime


class RunCodeRequest(BaseModel):
    interview_id: str
    question_id: int
    code: str
    language: str  # python, cpp, java, javascript


class SubmitCodeRequest(BaseModel):
    interview_id: str
    question_id: int
    code: str
    language: str


class TestCaseResult(BaseModel):
    test_case_num: int
    input: str
    expected_output: str
    actual_output: Optional[str] = None
    passed: bool
    execution_time_ms: Optional[float] = None
    memory_used_kb: Optional[int] = None
    error: Optional[str] = None
    status: str  # Accepted, Wrong Answer, Time Limit Exceeded, etc.


class SubmissionCreate(BaseModel):
    interview_id: str
    question_id: int
    code: str
    language: str
    submission_type: str = "submit"


class SubmissionResponse(BaseModel):
    submission_id: int
    question_id: int
    passed: int
    total: int
    score: float
    results: List[TestCaseResult]
    status: str

    class Config:
        from_attributes = True


class QuestionResult(BaseModel):
    question_id: int
    title: str
    difficulty: str
    passed: int
    total: int
    score: float
    max_score: float
    submitted: bool


class ResultResponse(BaseModel):
    interview_id: str
    total_score: float
    max_score: float
    percentage: float
    question_wise: List[QuestionResult]
    final_verdict: str  # Pass or Fail
    time_taken_minutes: Optional[int] = None
    completed_at: Optional[datetime] = None
