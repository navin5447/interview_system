from sqlalchemy import Column, Integer, String, Text, JSON, Enum
from ..database import Base
import enum


class DifficultyLevel(str, enum.Enum):
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"


class Question(Base):
    __tablename__ = "questions"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    difficulty = Column(String(20), nullable=False)  # easy, medium, hard
    input_format = Column(Text, nullable=True)
    output_format = Column(Text, nullable=True)
    constraints = Column(Text, nullable=True)
    visible_test_cases = Column(JSON, nullable=False, default=list)
    hidden_test_cases = Column(JSON, nullable=False, default=list)
    boilerplate_code = Column(JSON, nullable=True)  # Per-language boilerplate
    time_limit_ms = Column(Integer, default=2000)  # 2 seconds default
    memory_limit_kb = Column(Integer, default=262144)  # 256MB default

    def __repr__(self):
        return f"<Question(id={self.id}, title='{self.title}', difficulty='{self.difficulty}')>"
