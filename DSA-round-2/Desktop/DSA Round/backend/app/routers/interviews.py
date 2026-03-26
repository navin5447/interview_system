from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime, timedelta

from ..database import get_db
from ..models.interview import Interview
from ..models.question import Question
from ..schemas.interview import (
    InterviewCreate,
    InterviewResponse,
    InterviewStatusResponse,
    QuestionSummary
)
from ..services.question_selector import question_selector

router = APIRouter(prefix="/api/interviews", tags=["interviews"])


@router.post("/start", response_model=InterviewResponse)
def start_interview(request: InterviewCreate, db: Session = Depends(get_db)):
    """
    Start a new interview session with specified difficulty distribution
    """
    # Validate total questions match distribution
    dist_total = request.difficulty_distribution.easy + \
                 request.difficulty_distribution.medium + \
                 request.difficulty_distribution.hard

    if dist_total != request.total_questions:
        raise HTTPException(
            status_code=400,
            detail=f"Distribution total ({dist_total}) doesn't match total_questions ({request.total_questions})"
        )

    # Validate availability
    distribution = {
        "easy": request.difficulty_distribution.easy,
        "medium": request.difficulty_distribution.medium,
        "hard": request.difficulty_distribution.hard
    }

    validation = question_selector.validate_distribution(db, distribution)
    for difficulty, result in validation.items():
        if not result["valid"]:
            raise HTTPException(
                status_code=400,
                detail=f"Not enough {difficulty} questions. Requested: {result['requested']}, Available: {result['available']}"
            )

    # Select questions
    try:
        questions = question_selector.select_questions(db, distribution)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Create interview session
    start_time = datetime.utcnow()
    end_time = start_time + timedelta(minutes=request.duration_minutes)

    interview = Interview(
        candidate_id=request.candidate_id,
        config=distribution,
        question_ids=[q.id for q in questions],
        duration_minutes=request.duration_minutes,
        start_time=start_time,
        end_time=end_time,
        status="in_progress"
    )

    db.add(interview)
    db.commit()
    db.refresh(interview)

    # Build response
    question_summaries = [
        QuestionSummary(id=q.id, title=q.title, difficulty=q.difficulty)
        for q in questions
    ]

    return InterviewResponse(
        interview_id=interview.id,
        questions=question_summaries,
        start_time=start_time,
        end_time=end_time,
        duration_minutes=request.duration_minutes,
        status=interview.status
    )


@router.get("/{interview_id}", response_model=InterviewStatusResponse)
def get_interview_status(interview_id: str, db: Session = Depends(get_db)):
    """
    Get interview status and remaining time
    """
    interview = db.query(Interview).filter(Interview.id == interview_id).first()

    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")

    # Calculate remaining time
    time_remaining = None
    if interview.end_time and interview.status == "in_progress":
        remaining = (interview.end_time - datetime.utcnow()).total_seconds()
        time_remaining = max(0, int(remaining))

        # Auto-expire if time is up
        if time_remaining <= 0:
            interview.status = "expired"
            db.commit()

    # Count submissions
    from ..models.submission import Submission
    submitted_count = db.query(Submission).filter(
        Submission.interview_id == interview_id,
        Submission.submission_type == "submit"
    ).distinct(Submission.question_id).count()

    return InterviewStatusResponse(
        interview_id=interview.id,
        status=interview.status,
        start_time=interview.start_time,
        end_time=interview.end_time,
        time_remaining_seconds=time_remaining,
        questions_count=len(interview.question_ids),
        submitted_count=submitted_count
    )


@router.post("/{interview_id}/complete")
def complete_interview(interview_id: str, db: Session = Depends(get_db)):
    """
    Mark an interview as completed
    """
    interview = db.query(Interview).filter(Interview.id == interview_id).first()

    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")

    if interview.status == "completed":
        raise HTTPException(status_code=400, detail="Interview already completed")

    interview.status = "completed"
    interview.end_time = datetime.utcnow()
    db.commit()

    return {"message": "Interview completed", "interview_id": interview_id}


@router.get("/available/counts")
def get_available_question_counts(db: Session = Depends(get_db)):
    """
    Get count of available questions per difficulty
    """
    counts = question_selector.get_available_counts(db)
    return counts
