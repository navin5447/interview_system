import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path

from pymongo import MongoClient

from app.core.config import settings


def _ensure_storage() -> None:
    storage = Path(settings.storage_dir)
    storage.mkdir(parents=True, exist_ok=True)
    (storage / "audio").mkdir(parents=True, exist_ok=True)
    (storage / "reports").mkdir(parents=True, exist_ok=True)


_ensure_storage()


def init_sqlite() -> None:
    with sqlite3.connect(settings.sqlite_path) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS resumes (
                id TEXT PRIMARY KEY,
                filename TEXT,
                parsed_data TEXT,
                created_at TEXT
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                role TEXT,
                resume_id TEXT,
                questions TEXT,
                hr_prompt TEXT DEFAULT '',
                interview_config TEXT DEFAULT '{}',
                started_at TEXT,
                ended_at TEXT,
                status TEXT,
                report_id TEXT,
                FOREIGN KEY(resume_id) REFERENCES resumes(id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS responses (
                id TEXT PRIMARY KEY,
                session_id TEXT,
                question_id TEXT,
                question_text TEXT,
                transcript TEXT,
                keywords TEXT,
                scores TEXT,
                response_time REAL,
                dead_end_time REAL DEFAULT 0,
                audio_path TEXT,
                created_at TEXT,
                FOREIGN KEY(session_id) REFERENCES sessions(id)
            )
            """
        )

        columns = {row[1] for row in conn.execute("PRAGMA table_info(responses)").fetchall()}
        if "dead_end_time" not in columns:
            conn.execute("ALTER TABLE responses ADD COLUMN dead_end_time REAL DEFAULT 0")

        session_columns = {row[1] for row in conn.execute("PRAGMA table_info(sessions)").fetchall()}
        if "hr_prompt" not in session_columns:
            conn.execute("ALTER TABLE sessions ADD COLUMN hr_prompt TEXT DEFAULT ''")
        if "interview_config" not in session_columns:
            conn.execute("ALTER TABLE sessions ADD COLUMN interview_config TEXT DEFAULT '{}'")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS emotions (
                id TEXT PRIMARY KEY,
                session_id TEXT,
                ts TEXT,
                emotion TEXT,
                confidence REAL,
                FOREIGN KEY(session_id) REFERENCES sessions(id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS reports (
                id TEXT PRIMARY KEY,
                session_id TEXT,
                path TEXT,
                created_at TEXT,
                FOREIGN KEY(session_id) REFERENCES sessions(id)
            )
            """
        )
        conn.commit()


@contextmanager
def sqlite_conn():
    conn = sqlite3.connect(settings.sqlite_path)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def row_json(row: sqlite3.Row, key: str, default):
    raw = row[key]
    if not raw:
        return default
    return json.loads(raw)


def get_mongo_collection():
    client = MongoClient(settings.mongodb_uri, serverSelectionTimeoutMS=2000)
    db = client[settings.mongodb_db]
    return db["reports"]
