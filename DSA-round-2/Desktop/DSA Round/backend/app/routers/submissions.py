from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime

from ..database import get_db
from ..models.question import Question
from ..models.interview import Interview
from ..models.submission import Submission
from ..schemas.submission import (
    RunCodeRequest,
    SubmitCodeRequest,
    SubmissionResponse,
    TestCaseResult,
    ResultResponse
)
from ..services.local_executor import local_executor, get_status_description
from ..services.evaluator import evaluator

router = APIRouter(prefix="/api/submissions", tags=["submissions"])


async def execute_test_cases(
    code: str,
    language: str,
    test_cases: list,
    time_limit_ms: int,
    memory_limit_kb: int
) -> List[TestCaseResult]:
    """Execute code against multiple test cases using local executor"""
    results = []
    import logging
    logger = logging.getLogger(__name__)

    for i, tc in enumerate(test_cases):
        logger.info(f"Executing test case {i+1}: {tc}")
        result = await local_executor.execute_code(
            code=code,
            language=language,
            stdin=tc.get("input", ""),
            expected_output=tc.get("output", ""),
            time_limit=time_limit_ms / 1000,
            memory_limit=memory_limit_kb
        )

        logger.info(f"Execution result: {result}")

        status = result.get("status", {})
        status_id = status.get("id", 0)
        actual_output = result.get("stdout", "") or ""
        expected_output = tc.get("output", "")

        # Determine if passed
        passed = False
        if status_id == 3:  # Accepted
            passed = evaluator.compare_outputs(expected_output, actual_output)
        elif status_id == 4:  # Wrong Answer
            passed = False

        # Build error message if any
        error = None
        if status_id == 6:  # Compilation Error
            error = result.get("compile_output", "Compilation Error")
        elif status_id >= 7 and status_id <= 12:  # Runtime Errors
            error = result.get("stderr", "") or get_status_description(status_id)
        elif status_id == 5:  # Time Limit Exceeded
            error = "Time Limit Exceeded"
        elif status_id == 13:  # Internal Error
            error = result.get("stderr", "Internal Error")

        results.append(TestCaseResult(
            test_case_num=i + 1,
            input=tc.get("input", ""),
            expected_output=expected_output,
            actual_output=actual_output.strip() if actual_output else None,
            passed=passed,
            execution_time_ms=float(result.get("time", 0) or 0) * 1000,
            memory_used_kb=result.get("memory"),
            error=error,
            status=get_status_description(status_id) if not passed else "Accepted"
        ))

    return results


@router.post("/run", response_model=SubmissionResponse)
async def run_code(request: RunCodeRequest, db: Session = Depends(get_db)):
    """
    Run code against visible test cases only
    """
    # Validate interview
    interview = db.query(Interview).filter(Interview.id == request.interview_id).first()
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")

    if interview.status not in ["in_progress", "pending"]:
        raise HTTPException(status_code=400, detail="Interview is not active")

    # Check time
    if interview.end_time and datetime.utcnow() > interview.end_time:
        interview.status = "expired"
        db.commit()
        raise HTTPException(status_code=400, detail="Interview time has expired")

    # Validate question
    question = db.query(Question).filter(Question.id == request.question_id).first()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    if request.question_id not in interview.question_ids:
        raise HTTPException(status_code=403, detail="Question not part of this interview")

    # Execute against visible test cases
    test_cases = question.visible_test_cases
    results = await execute_test_cases(
        code=request.code,
        language=request.language,
        test_cases=test_cases,
        time_limit_ms=question.time_limit_ms,
        memory_limit_kb=question.memory_limit_kb
    )

    # Calculate score (for display only, not stored for runs)
    eval_result = evaluator.evaluate_submission_results(
        [r.model_dump() for r in results],
        question.difficulty
    )

    # Save submission with type "run"
    submission = Submission(
        interview_id=request.interview_id,
        question_id=request.question_id,
        code=request.code,
        language=request.language,
        submission_type="run",
        results=[r.model_dump() for r in results],
        passed_tests=eval_result["passed"],
        total_tests=eval_result["total"],
        score=eval_result["score"],
        status="completed"
    )

    db.add(submission)
    db.commit()
    db.refresh(submission)

    return SubmissionResponse(
        submission_id=submission.id,
        question_id=request.question_id,
        passed=eval_result["passed"],
        total=eval_result["total"],
        score=eval_result["score"],
        results=results,
        status="completed"
    )


@router.post("/submit", response_model=SubmissionResponse)
async def submit_code(request: SubmitCodeRequest, db: Session = Depends(get_db)):
    """
    Submit code for final evaluation against hidden test cases
    """
    # Validate interview
    interview = db.query(Interview).filter(Interview.id == request.interview_id).first()
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")

    if interview.status not in ["in_progress", "pending"]:
        raise HTTPException(status_code=400, detail="Interview is not active")

    # Check time
    if interview.end_time and datetime.utcnow() > interview.end_time:
        interview.status = "expired"
        db.commit()
        raise HTTPException(status_code=400, detail="Interview time has expired")

    # Validate question
    question = db.query(Question).filter(Question.id == request.question_id).first()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    if request.question_id not in interview.question_ids:
        raise HTTPException(status_code=403, detail="Question not part of this interview")

    # Execute against hidden test cases
    test_cases = question.hidden_test_cases
    results = await execute_test_cases(
        code=request.code,
        language=request.language,
        test_cases=test_cases,
        time_limit_ms=question.time_limit_ms,
        memory_limit_kb=question.memory_limit_kb
    )

    # Calculate score
    eval_result = evaluator.evaluate_submission_results(
        [r.model_dump() for r in results],
        question.difficulty
    )

    # Save submission
    submission = Submission(
        interview_id=request.interview_id,
        question_id=request.question_id,
        code=request.code,
        language=request.language,
        submission_type="submit",
        results=[r.model_dump() for r in results],
        passed_tests=eval_result["passed"],
        total_tests=eval_result["total"],
        score=eval_result["score"],
        status="completed"
    )

    db.add(submission)
    db.commit()
    db.refresh(submission)

    # Hide actual outputs in response for hidden test cases
    hidden_results = []
    for r in results:
        hidden_results.append(TestCaseResult(
            test_case_num=r.test_case_num,
            input="Hidden",
            expected_output="Hidden",
            actual_output="Hidden" if r.passed else None,
            passed=r.passed,
            execution_time_ms=r.execution_time_ms,
            memory_used_kb=r.memory_used_kb,
            error=r.error if not r.passed else None,
            status=r.status
        ))

    return SubmissionResponse(
        submission_id=submission.id,
        question_id=request.question_id,
        passed=eval_result["passed"],
        total=eval_result["total"],
        score=eval_result["score"],
        results=hidden_results,
        status="completed"
    )


@router.get("/results/{interview_id}", response_model=ResultResponse)
def get_results(interview_id: str, db: Session = Depends(get_db)):
    """
    Get final results for an interview
    """
    try:
        results = evaluator.get_interview_results(db, interview_id)
        return results
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/history/{interview_id}/{question_id}")
def get_submission_history(
    interview_id: str,
    question_id: int,
    db: Session = Depends(get_db)
):
    """
    Get submission history for a specific question in an interview
    """
    submissions = db.query(Submission).filter(
        Submission.interview_id == interview_id,
        Submission.question_id == question_id
    ).order_by(Submission.created_at.desc()).all()

    return [
        {
            "id": s.id,
            "type": s.submission_type,
            "language": s.language,
            "passed": s.passed_tests,
            "total": s.total_tests,
            "score": s.score,
            "status": s.status,
            "created_at": s.created_at
        }
        for s in submissions
    ]
