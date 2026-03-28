import json
import uuid
from datetime import datetime
from pathlib import Path

from app.core.database import row_json, sqlite_conn
from app.models.schemas import EmotionResult, QuestionItem, ResumeParsedData


FILLERS = {"um", "uh", "like", "you know"}


def save_resume(filename: str, parsed: ResumeParsedData) -> str:
    resume_id = str(uuid.uuid4())
    with sqlite_conn() as conn:
        conn.execute(
            "INSERT INTO resumes(id, filename, parsed_data, created_at) VALUES(?, ?, ?, ?)",
            (resume_id, filename, parsed.model_dump_json(), datetime.utcnow().isoformat()),
        )
    return resume_id


def get_resume(resume_id: str) -> ResumeParsedData:
    with sqlite_conn() as conn:
        row = conn.execute("SELECT * FROM resumes WHERE id = ?", (resume_id,)).fetchone()
    
    if not row:
        # Handle mock resume IDs from SmartRecruit (e.g., app_183)
        if resume_id.startswith("app_"):
            return ResumeParsedData(
                name="Candidate",
                summary="Experienced professional from SmartRecruit application",
                skills=["Technical Interview", "Problem Solving", "Communication"],
                experience_years=5.0,
                raw_text="Candidate resume from SmartRecruit",
            )
        raise ValueError("Resume not found")
    return ResumeParsedData.model_validate_json(row["parsed_data"])


def create_session(
    resume_id: str,
    role: str,
    questions: list[QuestionItem],
    hr_prompt: str = "",
    interview_config: dict | None = None,
) -> str:
    session_id = str(uuid.uuid4())
    config = interview_config or {}
    with sqlite_conn() as conn:
        conn.execute(
            """
            INSERT INTO sessions(id, role, resume_id, questions, hr_prompt, interview_config, started_at, status)
            VALUES(?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                session_id,
                role,
                resume_id,
                json.dumps([q.model_dump() for q in questions]),
                hr_prompt.strip(),
                json.dumps(config),
                datetime.utcnow().isoformat(),
                "active",
            ),
        )
    return session_id


def get_session(session_id: str):
    with sqlite_conn() as conn:
        row = conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone()
    return row


def append_response(
    session_id: str,
    question_id: str,
    question_text: str,
    keywords: list[str],
    transcript_chunk: str,
    response_time: float,
    audio_path: str,
) -> None:
    with sqlite_conn() as conn:
        existing = conn.execute(
            "SELECT * FROM responses WHERE session_id = ? AND question_id = ?",
            (session_id, question_id),
        ).fetchone()
        if existing:
            merged = (existing["transcript"] or "") + " " + transcript_chunk
            conn.execute(
                "UPDATE responses SET transcript = ?, response_time = ?, audio_path = ? WHERE id = ?",
                (merged.strip(), response_time, audio_path, existing["id"]),
            )
            return

        conn.execute(
            """
            INSERT INTO responses(id, session_id, question_id, question_text, transcript, keywords, response_time, audio_path, created_at)
            VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(uuid.uuid4()),
                session_id,
                question_id,
                question_text,
                transcript_chunk,
                json.dumps(keywords),
                response_time,
                audio_path,
                datetime.utcnow().isoformat(),
            ),
        )


def save_scores(session_id: str, question_id: str, scores: dict):
    with sqlite_conn() as conn:
        row = conn.execute(
            "SELECT * FROM responses WHERE session_id = ? AND question_id = ?",
            (session_id, question_id),
        ).fetchone()
        if row:
            conn.execute("UPDATE responses SET scores = ? WHERE id = ?", (json.dumps(scores), row["id"]))


def upsert_evaluation_result(
    session_id: str,
    question_id: str,
    question_text: str,
    keywords: list[str],
    transcript: str,
    response_time: float,
    dead_end_time: float,
    scores: dict,
) -> None:
    with sqlite_conn() as conn:
        row = conn.execute(
            "SELECT * FROM responses WHERE session_id = ? AND question_id = ?",
            (session_id, question_id),
        ).fetchone()

        if row:
            conn.execute(
                "UPDATE responses SET question_text = ?, transcript = ?, keywords = ?, response_time = ?, dead_end_time = ?, scores = ? WHERE id = ?",
                (
                    question_text,
                    transcript,
                    json.dumps(keywords),
                    response_time,
                    dead_end_time,
                    json.dumps(scores),
                    row["id"],
                ),
            )
            return

        conn.execute(
            """
            INSERT INTO responses(id, session_id, question_id, question_text, transcript, keywords, scores, response_time, dead_end_time, audio_path, created_at)
            VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(uuid.uuid4()),
                session_id,
                question_id,
                question_text,
                transcript,
                json.dumps(keywords),
                json.dumps(scores),
                response_time,
                dead_end_time,
                "",
                datetime.utcnow().isoformat(),
            ),
        )


def save_emotion(session_id: str, result: EmotionResult) -> None:
    with sqlite_conn() as conn:
        conn.execute(
            "INSERT INTO emotions(id, session_id, ts, emotion, confidence) VALUES(?, ?, ?, ?, ?)",
            (str(uuid.uuid4()), session_id, result.timestamp.isoformat(), result.emotion, result.confidence),
        )


def get_session_bundle(session_id: str) -> dict:
    with sqlite_conn() as conn:
        session = conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone()
        responses = conn.execute("SELECT * FROM responses WHERE session_id = ? ORDER BY created_at ASC", (session_id,)).fetchall()
        emotions = conn.execute("SELECT * FROM emotions WHERE session_id = ? ORDER BY ts", (session_id,)).fetchall()

    if not session:
        raise ValueError("Session not found")

    response_items = []
    for row in responses:
        response_items.append(
            {
                "question_id": row["question_id"],
                "question_text": row["question_text"],
                "transcript": row["transcript"] or "",
                "keywords": json.loads(row["keywords"] or "[]"),
                "scores": json.loads(row["scores"] or "{}"),
                "response_time": row["response_time"] or 0.0,
                "dead_end_time": row["dead_end_time"] or 0.0,
                "audio_path": row["audio_path"],
            }
        )

    emotion_items = [
        {"timestamp": row["ts"], "emotion": row["emotion"], "confidence": row["confidence"]} for row in emotions
    ]

    return {
        "session": dict(session),
        "questions": row_json(session, "questions", []),
        "responses": response_items,
        "emotions": emotion_items,
    }


def finalize_session(session_id: str, report_id: str) -> None:
    with sqlite_conn() as conn:
        conn.execute(
            "UPDATE sessions SET status = ?, ended_at = ?, report_id = ? WHERE id = ?",
            ("completed", datetime.utcnow().isoformat(), report_id, session_id),
        )


def save_report_record(report_id: str, session_id: str, path: Path) -> None:
    with sqlite_conn() as conn:
        conn.execute(
            "INSERT INTO reports(id, session_id, path, created_at) VALUES(?, ?, ?, ?)",
            (report_id, session_id, str(path), datetime.utcnow().isoformat()),
        )


def get_report_path(report_id: str) -> str | None:
    with sqlite_conn() as conn:
        row = conn.execute("SELECT path FROM reports WHERE id = ?", (report_id,)).fetchone()
    return row["path"] if row else None


def count_fillers(text: str) -> int:
    lowered = text.lower()
    count = 0
    for filler in FILLERS:
        count += lowered.count(filler)
    return count


def append_session_question(session_id: str, question: QuestionItem) -> list[dict]:
    with sqlite_conn() as conn:
        row = conn.execute("SELECT questions FROM sessions WHERE id = ?", (session_id,)).fetchone()
        if not row:
            raise ValueError("Session not found")

        questions = json.loads(row["questions"] or "[]")
        questions.append(question.model_dump())
        conn.execute("UPDATE sessions SET questions = ? WHERE id = ?", (json.dumps(questions), session_id))
        return questions
