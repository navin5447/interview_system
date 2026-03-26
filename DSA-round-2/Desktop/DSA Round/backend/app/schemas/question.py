from pydantic import BaseModel
from typing import List, Optional, Dict


class TestCase(BaseModel):
    input: str
    output: str


class QuestionBase(BaseModel):
    title: str
    description: str
    difficulty: str  # easy, medium, hard
    input_format: Optional[str] = None
    output_format: Optional[str] = None
    constraints: Optional[str] = None
    visible_test_cases: List[TestCase]
    hidden_test_cases: List[TestCase]
    boilerplate_code: Optional[Dict[str, str]] = None
    time_limit_ms: int = 2000
    memory_limit_kb: int = 262144


class QuestionCreate(QuestionBase):
    pass


class QuestionResponse(BaseModel):
    id: int
    title: str
    description: str
    difficulty: str
    input_format: Optional[str] = None
    output_format: Optional[str] = None
    constraints: Optional[str] = None
    visible_test_cases: List[TestCase]
    boilerplate_code: Optional[Dict[str, str]] = None
    time_limit_ms: int
    memory_limit_kb: int

    class Config:
        from_attributes = True


class QuestionFullResponse(QuestionBase):
    id: int

    class Config:
        from_attributes = True
