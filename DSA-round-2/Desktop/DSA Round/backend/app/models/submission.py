from sqlalchemy import Column, Integer, String, Text, DateTime, JSON, Float, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from ..database import Base


class Submission(Base):
    __tablename__ = "submissions"

    id = Column(Integer, primary_key=True, index=True)
    interview_id = Column(String(36), ForeignKey("interviews.id"), nullable=False)
    question_id = Column(Integer, nullable=False)
    code = Column(Text, nullable=False)
    language = Column(String(20), nullable=False)
    submission_type = Column(String(20), default="submit")  # run or submit

    # Results
    results = Column(JSON, nullable=True)  # Detailed test case results
    passed_tests = Column(Integer, default=0)
    total_tests = Column(Integer, default=0)
    score = Column(Float, default=0.0)

    # Execution info
    execution_time_ms = Column(Float, nullable=True)
    memory_used_kb = Column(Integer, nullable=True)
    status = Column(String(50), default="pending")  # pending, running, completed, error

    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    interview = relationship("Interview", back_populates="submissions")

    def __repr__(self):
        return f"<Submission(id={self.id}, question_id={self.question_id}, status='{self.status}')>"
