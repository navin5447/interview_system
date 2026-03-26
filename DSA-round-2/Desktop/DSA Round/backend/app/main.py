from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import json
import os

from .config import settings
from .database import init_db, SessionLocal
from .models.question import Question
from .routers import interviews, questions, submissions


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize database and seed questions on startup"""
    init_db()
    seed_questions()
    yield


app = FastAPI(
    title="DSA Interview Platform",
    description="A coding interview platform for DSA assessments",
    version="1.0.0",
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url, "http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(interviews.router)
app.include_router(questions.router)
app.include_router(submissions.router)


@app.get("/")
def root():
    return {
        "message": "DSA Interview Platform API",
        "version": "1.0.0",
        "docs": "/docs"
    }


@app.get("/health")
def health_check():
    return {"status": "healthy"}


@app.get("/test-executor")
async def test_executor():
    """Test endpoint for debugging executor"""
    from .services.local_executor import local_executor

    code = """def fizz_buzz(n):
    result = []
    for i in range(1, n+1):
        if i % 15 == 0:
            result.append("FizzBuzz")
        elif i % 3 == 0:
            result.append("Fizz")
        elif i % 5 == 0:
            result.append("Buzz")
        else:
            result.append(str(i))
    return result

n = int(input())
result = fizz_buzz(n)
for item in result:
    print(item)"""

    exec_result = await local_executor.execute_code(
        code=code,
        language="python",
        stdin="3",
        expected_output="1\n2\nFizz"
    )

    return {"result": exec_result}


def seed_questions():
    """Seed initial questions from JSON file"""
    db = SessionLocal()

    try:
        # Check if questions already exist
        existing = db.query(Question).count()
        if existing > 0:
            print(f"Questions already seeded ({existing} questions)")
            return

        # Load questions from JSON
        questions_path = os.path.join(
            os.path.dirname(__file__),
            "data",
            "questions.json"
        )

        if not os.path.exists(questions_path):
            print("Questions file not found, skipping seed")
            return

        with open(questions_path, "r") as f:
            questions_data = json.load(f)

        for q_data in questions_data:
            question = Question(
                title=q_data["title"],
                description=q_data["description"],
                difficulty=q_data["difficulty"],
                input_format=q_data.get("input_format"),
                output_format=q_data.get("output_format"),
                constraints=q_data.get("constraints"),
                visible_test_cases=q_data.get("visible_test_cases", []),
                hidden_test_cases=q_data.get("hidden_test_cases", []),
                boilerplate_code=q_data.get("boilerplate_code"),
                time_limit_ms=q_data.get("time_limit_ms", 2000),
                memory_limit_kb=q_data.get("memory_limit_kb", 262144)
            )
            db.add(question)

        db.commit()
        print(f"Seeded {len(questions_data)} questions")

    except Exception as e:
        print(f"Error seeding questions: {e}")
        db.rollback()
    finally:
        db.close()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
