"""
Question Generator Engine
Generates MCQ questions using Groq LLM based on job role/requirements
"""

import json
import re
from typing import List, Dict, Any
from groq_client import get_groq_client


SYSTEM_PROMPT = """You are an expert technical interviewer and assessment designer.
Your task is to generate high-quality Multiple Choice Questions (MCQs) for interview assessments based on job role and requirements.

You MUST follow these STRICT rules:
1. Generate questions in valid JSON format ONLY
2. Each question must have exactly 4 options (A, B, C, D)
3. Only ONE option should be correct
4. Include a clear explanation for the correct answer
5. Assign appropriate difficulty level (easy, medium, hard)
6. Tag questions with category (technical, behavioral, situational, domain-specific)

QUESTION TYPES TO INCLUDE:
- Technical concepts and fundamentals for the role
- Practical scenario-based questions
- Problem-solving questions relevant to the job
- Best practices and industry standards
- Tools and technologies mentioned in the job requirements

QUALITY GUIDELINES:
- Make questions specific to the technologies and skills mentioned in the job requirements
- Include scenario-based questions for practical assessment
- Ensure distractors (wrong options) are plausible but clearly incorrect
- Questions should test real understanding, not just memorization
- Cover different aspects of the job role comprehensively

OUTPUT FORMAT:
Return ONLY a valid JSON array with this exact structure:
[
  {
    "question": "The question text here?",
    "options": {
      "A": "First option",
      "B": "Second option",
      "C": "Third option",
      "D": "Fourth option"
    },
    "answer": "B",
    "explanation": "Clear explanation of why B is correct and others are wrong.",
    "difficulty": "medium",
    "category": "technical"
  }
]

Do NOT include any text before or after the JSON array. ONLY output the JSON array."""


def generate_questions(
    job_requirements: str,
    num_questions: int = 15,
    difficulty_distribution: Dict[str, int] = None
) -> List[Dict[str, Any]]:
    """
    Generate MCQ questions based on job role and requirements

    Args:
        job_requirements: Structured text/JSON of job role and requirements
        num_questions: Number of questions to generate (default: 15)
        difficulty_distribution: Dict with easy, medium, hard percentages

    Returns:
        List of question dictionaries
    """
    client = get_groq_client()

    # Default difficulty distribution
    if difficulty_distribution is None:
        difficulty_distribution = {"easy": 20, "medium": 50, "hard": 30}

    # Calculate difficulty distribution
    easy_count = int(num_questions * (difficulty_distribution.get("easy", 20) / 100))
    medium_count = int(num_questions * (difficulty_distribution.get("medium", 50) / 100))
    hard_count = num_questions - easy_count - medium_count

    user_prompt = f"""Generate exactly {num_questions} MCQ interview questions for the following job role.

=== JOB ROLE & REQUIREMENTS ===
{job_requirements}

=== DIFFICULTY DISTRIBUTION ===
- Easy Questions: {easy_count} (fundamental concepts, basic knowledge)
- Medium Questions: {medium_count} (application-level, moderate complexity)
- Hard Questions: {hard_count} (advanced concepts, complex scenarios)

Generate questions that thoroughly assess a candidate's knowledge and skills for this role.
Output ONLY the JSON array, nothing else."""

    response = client.generate_response(SYSTEM_PROMPT, user_prompt, temperature=0.7)

    # Parse the JSON response
    questions = parse_questions_response(response)

    return questions


def parse_questions_response(response: str) -> List[Dict[str, Any]]:
    """
    Parse the LLM response and extract questions JSON

    Args:
        response: Raw LLM response text

    Returns:
        Parsed list of question dictionaries
    """
    # Try to find JSON array in the response
    try:
        # First, try direct parsing
        questions = json.loads(response)
        if isinstance(questions, list):
            return validate_questions(questions)
    except json.JSONDecodeError:
        pass

    # Try to extract JSON from the response
    json_match = re.search(r'\[[\s\S]*\]', response)
    if json_match:
        try:
            questions = json.loads(json_match.group())
            if isinstance(questions, list):
                return validate_questions(questions)
        except json.JSONDecodeError:
            pass

    raise ValueError("Failed to parse questions from LLM response")


def validate_questions(questions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Validate and normalize question format

    Args:
        questions: List of raw question dictionaries

    Returns:
        Validated and normalized questions
    """
    validated = []

    for i, q in enumerate(questions):
        # Ensure required fields exist
        if "question" not in q:
            continue

        # Normalize options format
        options = q.get("options", {})
        if isinstance(options, list):
            # Convert list to dict format
            options = {
                "A": options[0] if len(options) > 0 else "",
                "B": options[1] if len(options) > 1 else "",
                "C": options[2] if len(options) > 2 else "",
                "D": options[3] if len(options) > 3 else ""
            }

        validated_q = {
            "id": i + 1,
            "question": q.get("question", ""),
            "options": options,
            "answer": q.get("answer", "A").upper(),
            "explanation": q.get("explanation", ""),
            "difficulty": q.get("difficulty", "medium").lower(),
            "category": q.get("category", "technical").lower()
        }

        # Validate answer is A, B, C, or D
        if validated_q["answer"] not in ["A", "B", "C", "D"]:
            validated_q["answer"] = "A"

        # Validate difficulty
        if validated_q["difficulty"] not in ["easy", "medium", "hard"]:
            validated_q["difficulty"] = "medium"

        validated.append(validated_q)

    return validated


def check_answer(question_id: int, questions: List[Dict[str, Any]], selected_answer: str) -> Dict[str, Any]:
    """
    Check if the selected answer is correct

    Args:
        question_id: The question ID (1-indexed)
        questions: List of all questions
        selected_answer: The selected option (A, B, C, or D)

    Returns:
        Result dictionary with correctness and explanation
    """
    for q in questions:
        if q["id"] == question_id:
            is_correct = q["answer"].upper() == selected_answer.upper()
            return {
                "correct": is_correct,
                "correct_answer": q["answer"],
                "explanation": q["explanation"],
                "selected": selected_answer.upper()
            }

    return {"error": "Question not found"}
