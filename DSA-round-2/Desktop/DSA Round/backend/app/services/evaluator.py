from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from ..models.submission import Submission
from ..models.question import Question
from ..models.interview import Interview
from ..schemas.submission import QuestionResult, ResultResponse, TestCaseResult
from datetime import datetime


# Scoring weights by difficulty
DIFFICULTY_WEIGHTS = {
    "easy": 1,
    "medium": 2,
    "hard": 3
}


class Evaluator:
    """Service for evaluating code submissions and calculating scores"""

    @staticmethod
    def normalize_output(output: str) -> str:
        """Normalize output for comparison (strip whitespace, normalize line endings)"""
        if output is None:
            return ""
        # Normalize line endings: \r\n -> \n
        output = output.replace('\r\n', '\n').replace('\r', '\n')
        # Strip trailing whitespace from each line, then strip overall
        lines = [line.rstrip() for line in output.strip().split('\n')]
        return '\n'.join(lines)

    @staticmethod
    def compare_outputs(expected: str, actual: str) -> bool:
        """Compare expected and actual outputs"""
        return Evaluator.normalize_output(expected) == Evaluator.normalize_output(actual)

    @staticmethod
    def calculate_question_score(
        passed_tests: int,
        total_tests: int,
        difficulty: str
    ) -> tuple[float, float]:
        """
        Calculate score for a question

        Returns:
            Tuple of (achieved_score, max_score)
        """
        weight = DIFFICULTY_WEIGHTS.get(difficulty, 1)
        max_score = weight

        if total_tests == 0:
            return 0.0, max_score

        ratio = passed_tests / total_tests
        achieved_score = round(ratio * weight, 2)

        return achieved_score, max_score

    @staticmethod
    def evaluate_submission_results(
        results: List[Dict[str, Any]],
        difficulty: str
    ) -> Dict[str, Any]:
        """
        Evaluate test case results and calculate score

        Args:
            results: List of test case execution results
            difficulty: Question difficulty level

        Returns:
            Dict with passed, total, score, and detailed results
        """
        passed = sum(1 for r in results if r.get("passed", False))
        total = len(results)
        score, max_score = Evaluator.calculate_question_score(passed, total, difficulty)

        return {
            "passed": passed,
            "total": total,
            "score": score,
            "max_score": max_score,
            "results": results
        }

    @staticmethod
    def get_interview_results(
        db: Session,
        interview_id: str,
        pass_threshold: float = 0.5
    ) -> ResultResponse:
        """
        Calculate final results for an interview

        Args:
            db: Database session
            interview_id: Interview ID
            pass_threshold: Minimum score percentage to pass (default 50%)

        Returns:
            ResultResponse with complete results
        """
        interview = db.query(Interview).filter(
            Interview.id == interview_id
        ).first()

        if not interview:
            raise ValueError(f"Interview not found: {interview_id}")

        question_results = []
        total_score = 0.0
        max_score = 0.0

        # Get all questions for this interview
        for question_id in interview.question_ids:
            question = db.query(Question).filter(
                Question.id == question_id
            ).first()

            if not question:
                continue

            # Get the latest submission for this question
            submission = db.query(Submission).filter(
                Submission.interview_id == interview_id,
                Submission.question_id == question_id,
                Submission.submission_type == "submit"
            ).order_by(Submission.created_at.desc()).first()

            q_max_score = DIFFICULTY_WEIGHTS.get(question.difficulty, 1)
            max_score += q_max_score

            if submission:
                question_results.append(QuestionResult(
                    question_id=question_id,
                    title=question.title,
                    difficulty=question.difficulty,
                    passed=submission.passed_tests,
                    total=submission.total_tests,
                    score=submission.score,
                    max_score=q_max_score,
                    submitted=True
                ))
                total_score += submission.score
            else:
                # No submission for this question
                hidden_count = len(question.hidden_test_cases)
                question_results.append(QuestionResult(
                    question_id=question_id,
                    title=question.title,
                    difficulty=question.difficulty,
                    passed=0,
                    total=hidden_count,
                    score=0.0,
                    max_score=q_max_score,
                    submitted=False
                ))

        # Calculate percentage and verdict
        percentage = (total_score / max_score * 100) if max_score > 0 else 0
        final_verdict = "Pass" if percentage >= (pass_threshold * 100) else "Fail"

        # Calculate time taken
        time_taken = None
        if interview.start_time:
            end = interview.end_time or datetime.utcnow()
            time_taken = int((end - interview.start_time).total_seconds() / 60)

        return ResultResponse(
            interview_id=interview_id,
            total_score=round(total_score, 2),
            max_score=round(max_score, 2),
            percentage=round(percentage, 2),
            question_wise=question_results,
            final_verdict=final_verdict,
            time_taken_minutes=time_taken,
            completed_at=interview.end_time
        )


evaluator = Evaluator()
