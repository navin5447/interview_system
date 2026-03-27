from pathlib import Path
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "AI Interview Backend"
    groq_api_key: str = Field(default="", alias="GROQ_API_KEY")
    groq_model: str = "llama-3.3-70b-versatile"
    whisper_model: str = "small"
    whisper_compute_type: str = "float16"
    mongodb_uri: str = "mongodb://localhost:27017"
    mongodb_db: str = "voice_interview"
    sqlite_path: str = str(Path(__file__).resolve().parents[2] / "storage" / "sessions.db")
    storage_dir: str = str(Path(__file__).resolve().parents[2] / "storage")
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://0.0.0.0:3000",
    ]


settings = Settings()
