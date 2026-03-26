"""
AI Interview Simulator - Backend API
FastAPI application for generating and managing interview questions
"""

import os
import json
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from dotenv import load_dotenv

from question_generator import generate_questions, check_answer

load_dotenv()

app = FastAPI(
    title="AI Interview Simulator",
    description="Generate and conduct AI-powered interview assessments",
    version="1.0.0"
)

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory session storage (for demo purposes)
sessions: Dict[str, Dict[str, Any]] = {}


class DifficultyConfig(BaseModel):
    easy: int = 20
    medium: int = 50
    hard: int = 30


class GenerateRequest(BaseModel):
    job_requirements: str
    num_questions: Optional[int] = 15
    difficulty: Optional[DifficultyConfig] = None


class AnswerRequest(BaseModel):
    session_id: str
    question_id: int
    selected_answer: str


class SessionResponse(BaseModel):
    session_id: str
    total_questions: int
    questions: List[Dict[str, Any]]


@app.get("/")
async def root():
    """Root endpoint - API info"""
    return {
        "name": "AI Interview Simulator API",
        "version": "1.0.0",
        "endpoints": {
            "generate": "POST /api/generate-questions",
            "answer": "POST /api/submit-answer",
            "results": "GET /api/results/{session_id}",
            "health": "GET /api/health"
        }
    }


@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "interview-simulator"}


@app.post("/api/generate-questions")
async def generate_interview_questions(request: GenerateRequest):
    """
    Generate MCQ questions based on job role and requirements

    Args:
        request: Contains job_requirements and optional num_questions

    Returns:
        Session ID and generated questions
    """
    try:
        # Prepare difficulty distribution
        difficulty_dist = None
        if request.difficulty:
            difficulty_dist = {
                "easy": request.difficulty.easy,
                "medium": request.difficulty.medium,
                "hard": request.difficulty.hard
            }

        # Generate questions using Groq
        questions = generate_questions(
            job_requirements=request.job_requirements,
            num_questions=request.num_questions,
            difficulty_distribution=difficulty_dist
        )

        # Create session
        import uuid
        session_id = str(uuid.uuid4())[:8]

        # Store session data
        sessions[session_id] = {
            "questions": questions,
            "answers": {},
            "total_questions": len(questions),
            "completed": False
        }

        # Return questions without answers for frontend
        questions_for_frontend = []
        for q in questions:
            questions_for_frontend.append({
                "id": q["id"],
                "question": q["question"],
                "options": q["options"],
                "difficulty": q["difficulty"],
                "category": q["category"]
            })

        return {
            "success": True,
            "session_id": session_id,
            "total_questions": len(questions),
            "questions": questions_for_frontend
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/submit-answer")
async def submit_answer(request: AnswerRequest):
    """
    Submit an answer for a question (without revealing correct answer)

    Args:
        request: Contains session_id, question_id, and selected_answer

    Returns:
        Confirmation that answer was recorded (no correct answer revealed)
    """
    if request.session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    session = sessions[request.session_id]
    questions = session["questions"]

    # Check the answer internally
    result = check_answer(request.question_id, questions, request.selected_answer)

    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])

    # Store the answer
    session["answers"][request.question_id] = {
        "selected": request.selected_answer,
        "correct": result["correct"]
    }

    # Return only confirmation - DO NOT reveal correct answer
    return {
        "success": True,
        "recorded": True,
        "selected": result["selected"]
    }


@app.get("/api/results/{session_id}")
async def get_results(session_id: str):
    """
    Get final results for a completed interview session

    Args:
        session_id: The session identifier

    Returns:
        Complete results with score and breakdown
    """
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    session = sessions[session_id]
    questions = session["questions"]
    answers = session["answers"]

    # Calculate score
    correct_count = sum(1 for a in answers.values() if a["correct"])
    total_answered = len(answers)
    total_questions = session["total_questions"]

    # Calculate by difficulty
    difficulty_breakdown = {"easy": {"correct": 0, "total": 0},
                           "medium": {"correct": 0, "total": 0},
                           "hard": {"correct": 0, "total": 0}}

    # Calculate by category
    category_breakdown = {}

    for q in questions:
        qid = q["id"]
        diff = q["difficulty"]
        cat = q["category"]

        difficulty_breakdown[diff]["total"] += 1
        if cat not in category_breakdown:
            category_breakdown[cat] = {"correct": 0, "total": 0}
        category_breakdown[cat]["total"] += 1

        if qid in answers and answers[qid]["correct"]:
            difficulty_breakdown[diff]["correct"] += 1
            category_breakdown[cat]["correct"] += 1

    # Detailed question results
    question_results = []
    for q in questions:
        qid = q["id"]
        answer_data = answers.get(qid, {"selected": None, "correct": False})
        question_results.append({
            "id": qid,
            "question": q["question"],
            "options": q["options"],
            "correct_answer": q["answer"],
            "selected_answer": answer_data["selected"],
            "is_correct": answer_data["correct"],
            "explanation": q["explanation"],
            "difficulty": q["difficulty"],
            "category": q["category"]
        })

    return {
        "success": True,
        "session_id": session_id,
        "score": {
            "correct": correct_count,
            "total": total_questions,
            "percentage": round((correct_count / total_questions) * 100, 1) if total_questions > 0 else 0
        },
        "difficulty_breakdown": difficulty_breakdown,
        "category_breakdown": category_breakdown,
        "questions": question_results
    }


@app.post("/api/upload-files")
async def upload_files(
    resume: UploadFile = File(...),
    job_requirements: UploadFile = File(...)
):
    """
    Upload resume and job requirements files

    Args:
        resume: Resume file (JSON or TXT)
        job_requirements: Job requirements file (JSON or TXT)

    Returns:
        Parsed content from both files
    """
    try:
        # Read resume content
        resume_bytes = await resume.read()
        resume_content = resume_bytes.decode("utf-8")

        # Try to parse as JSON, otherwise use as text
        try:
            resume_data = json.loads(resume_content)
            resume_content = json.dumps(resume_data, indent=2)
        except json.JSONDecodeError:
            pass  # Use as plain text

        # Read job requirements content
        job_bytes = await job_requirements.read()
        job_content = job_bytes.decode("utf-8")

        try:
            job_data = json.loads(job_content)
            job_content = json.dumps(job_data, indent=2)
        except json.JSONDecodeError:
            pass  # Use as plain text

        return {
            "success": True,
            "resume_content": resume_content,
            "job_requirements": job_content
        }

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error processing files: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    print("Starting AI Interview Simulator API...")
    print("API Documentation: http://localhost:8000/docs")
    uvicorn.run(app, host="0.0.0.0", port=8000)
