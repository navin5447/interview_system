from sqlalchemy import Column, Integer, String, DateTime, JSON, Float, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
from ..database import Base


def generate_uuid():
    return str(uuid.uuid4())


class Interview(Base):
    __tablename__ = "interviews"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    candidate_id = Column(String(255), nullable=True)  # Optional, for integration
    config = Column(JSON, nullable=False)  # Stores difficulty distribution
    question_ids = Column(JSON, nullable=False, default=list)  # List of question IDs
    duration_minutes = Column(Integer, default=60)
    start_time = Column(DateTime, nullable=True)
    end_time = Column(DateTime, nullable=True)
    status = Column(String(20), default="pending")  # pending, in_progress, completed, expired
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    submissions = relationship("Submission", back_populates="interview")

    def __repr__(self):
        return f"<Interview(id={self.id}, status='{self.status}')>"
