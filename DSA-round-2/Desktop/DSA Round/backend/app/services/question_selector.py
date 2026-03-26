import random
from typing import List, Dict
from sqlalchemy.orm import Session
from ..models.question import Question


class QuestionSelector:
    """Service for selecting questions based on difficulty distribution"""

    @staticmethod
    def select_questions(
        db: Session,
        difficulty_distribution: Dict[str, int]
    ) -> List[Question]:
        """
        Select questions based on difficulty distribution

        Args:
            db: Database session
            difficulty_distribution: Dict with keys 'easy', 'medium', 'hard' and counts

        Returns:
            List of selected Question objects, shuffled
        """
        selected_questions = []

        for difficulty, count in difficulty_distribution.items():
            if count <= 0:
                continue

            # Get all questions of this difficulty
            available = db.query(Question).filter(
                Question.difficulty == difficulty
            ).all()

            if len(available) < count:
                raise ValueError(
                    f"Not enough {difficulty} questions. "
                    f"Requested: {count}, Available: {len(available)}"
                )

            # Randomly select required number
            selected = random.sample(available, count)
            selected_questions.extend(selected)

        # Shuffle final list
        random.shuffle(selected_questions)

        return selected_questions

    @staticmethod
    def validate_distribution(
        db: Session,
        difficulty_distribution: Dict[str, int]
    ) -> Dict[str, Dict[str, int]]:
        """
        Validate if requested distribution can be satisfied

        Returns:
            Dict with validation results per difficulty
        """
        result = {}

        for difficulty, requested in difficulty_distribution.items():
            available = db.query(Question).filter(
                Question.difficulty == difficulty
            ).count()

            result[difficulty] = {
                "requested": requested,
                "available": available,
                "valid": available >= requested
            }

        return result

    @staticmethod
    def get_available_counts(db: Session) -> Dict[str, int]:
        """Get count of questions per difficulty level"""
        counts = {}
        for difficulty in ["easy", "medium", "hard"]:
            counts[difficulty] = db.query(Question).filter(
                Question.difficulty == difficulty
            ).count()
        return counts


question_selector = QuestionSelector()
