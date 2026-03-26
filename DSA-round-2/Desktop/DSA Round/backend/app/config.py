from pydantic_settings import BaseSettings
from typing import Optional
import os
from dotenv import load_dotenv

load_dotenv()


class Settings(BaseSettings):
    # Judge0 API Configuration
    judge0_api_url: str = os.getenv("JUDGE0_API_URL", "https://judge0-ce.p.rapidapi.com")
    judge0_api_key: str = os.getenv("JUDGE0_API_KEY", "")
    judge0_api_host: str = os.getenv("JUDGE0_API_HOST", "judge0-ce.p.rapidapi.com")

    # Database
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./interview.db")

    # CORS
    frontend_url: str = os.getenv("FRONTEND_URL", "http://localhost:5173")

    # App Settings
    debug: bool = os.getenv("DEBUG", "true").lower() == "true"

    # Language IDs for Judge0
    language_ids: dict = {
        "python": 71,    # Python 3.8.1
        "cpp": 54,       # C++ (GCC 9.2.0)
        "java": 62,      # Java (OpenJDK 13.0.1)
        "javascript": 63 # JavaScript (Node.js 12.14.0)
    }

    class Config:
        env_file = ".env"


settings = Settings()
