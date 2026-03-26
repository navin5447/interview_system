from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from ..database import get_db
from ..models.question import Question
from ..models.interview import Interview
from ..schemas.question import QuestionResponse, QuestionCreate

router = APIRouter(prefix="/api/questions", tags=["questions"])


@router.get("/{question_id}", response_model=QuestionResponse)
def get_question(
    question_id: int,
    interview_id: str = None,
    db: Session = Depends(get_db)
):
    """
    Get a specific question (without hidden test cases)

    If interview_id is provided, validates that the question belongs to the interview
    """
    question = db.query(Question).filter(Question.id == question_id).first()

    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    # Validate interview access if provided
    if interview_id:
        interview = db.query(Interview).filter(Interview.id == interview_id).first()
        if not interview:
            raise HTTPException(status_code=404, detail="Interview not found")
        if question_id not in interview.question_ids:
            raise HTTPException(status_code=403, detail="Question not part of this interview")

    return QuestionResponse(
        id=question.id,
        title=question.title,
        description=question.description,
        difficulty=question.difficulty,
        input_format=question.input_format,
        output_format=question.output_format,
        constraints=question.constraints,
        visible_test_cases=question.visible_test_cases,
        boilerplate_code=question.boilerplate_code,
        time_limit_ms=question.time_limit_ms,
        memory_limit_kb=question.memory_limit_kb
    )


@router.get("/interview/{interview_id}", response_model=List[QuestionResponse])
def get_interview_questions(interview_id: str, db: Session = Depends(get_db)):
    """
    Get all questions for an interview (without hidden test cases)
    """
    interview = db.query(Interview).filter(Interview.id == interview_id).first()

    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")

    questions = db.query(Question).filter(
        Question.id.in_(interview.question_ids)
    ).all()

    # Maintain order from interview
    ordered_questions = []
    for qid in interview.question_ids:
        for q in questions:
            if q.id == qid:
                ordered_questions.append(q)
                break

    return [
        QuestionResponse(
            id=q.id,
            title=q.title,
            description=q.description,
            difficulty=q.difficulty,
            input_format=q.input_format,
            output_format=q.output_format,
            constraints=q.constraints,
            visible_test_cases=q.visible_test_cases,
            boilerplate_code=q.boilerplate_code,
            time_limit_ms=q.time_limit_ms,
            memory_limit_kb=q.memory_limit_kb
        )
        for q in ordered_questions
    ]


# Admin endpoint to create questions (optional, mainly for seeding)
@router.post("/", response_model=QuestionResponse)
def create_question(question: QuestionCreate, db: Session = Depends(get_db)):
    """
    Create a new question (admin endpoint)
    """
    db_question = Question(
        title=question.title,
        description=question.description,
        difficulty=question.difficulty,
        input_format=question.input_format,
        output_format=question.output_format,
        constraints=question.constraints,
        visible_test_cases=[tc.model_dump() for tc in question.visible_test_cases],
        hidden_test_cases=[tc.model_dump() for tc in question.hidden_test_cases],
        boilerplate_code=question.boilerplate_code,
        time_limit_ms=question.time_limit_ms,
        memory_limit_kb=question.memory_limit_kb
    )

    db.add(db_question)
    db.commit()
    db.refresh(db_question)

    return QuestionResponse(
        id=db_question.id,
        title=db_question.title,
        description=db_question.description,
        difficulty=db_question.difficulty,
        input_format=db_question.input_format,
        output_format=db_question.output_format,
        constraints=db_question.constraints,
        visible_test_cases=db_question.visible_test_cases,
        boilerplate_code=db_question.boilerplate_code,
        time_limit_ms=db_question.time_limit_ms,
        memory_limit_kb=db_question.memory_limit_kb
    )
