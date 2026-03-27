import os
from dotenv import load_dotenv # type: ignore


_BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(_BASE_DIR, '.env'))


class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'TESTINGCHEATS123'
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or 'sqlite:///site.db'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SESSION_TYPE = 'filesystem'
    # Use absolute paths for upload folders
    _BASE_DIR = _BASE_DIR
    UPLOAD_FOLDER_CV = os.path.join(_BASE_DIR, 'app', 'static', 'uploads', 'cv')
    UPLOAD_FOLDER_PHOTOS = os.path.join(_BASE_DIR, 'app', 'static', 'uploads', 'photos')
    API_TOKEN = os.environ.get('API_TOKEN', 'default_api_token')
    API_URL = "https://api-inference.huggingface.co/models/meta-llama/Meta-Llama-3-8B-Instruct"
    MONGO_URI = 'mongodb://localhost:27017/applications'
    SMTP_HOST = os.environ.get('SMTP_HOST', 'smtp.gmail.com')
    SMTP_PORT = int(os.environ.get('SMTP_PORT', '587'))
    SMTP_USERNAME = os.environ.get('SMTP_USERNAME', '')
    SMTP_PASSWORD = os.environ.get('SMTP_PASSWORD', '')
    SMTP_FROM_EMAIL = os.environ.get('SMTP_FROM_EMAIL', SMTP_USERNAME or 'noreply@smartrecruit.local')
    SMTP_USE_TLS = os.environ.get('SMTP_USE_TLS', 'true').lower() == 'true'
    SHORTLIST_EMAIL_DELAY_MIN_SECONDS = int(os.environ.get('SHORTLIST_EMAIL_DELAY_MIN_SECONDS', '120'))
    SHORTLIST_EMAIL_DELAY_MAX_SECONDS = int(os.environ.get('SHORTLIST_EMAIL_DELAY_MAX_SECONDS', '300'))
    MCQ_API_URL = os.environ.get('MCQ_API_URL', 'http://localhost:8000')
    TECHNICAL_ROUND_URL = os.environ.get('TECHNICAL_ROUND_URL', 'http://127.0.0.1:3000/')
    EMAIL_SEND_MAX_ATTEMPTS = int(os.environ.get('EMAIL_SEND_MAX_ATTEMPTS', '3'))
    EMAIL_SEND_RETRY_BASE_SECONDS = int(os.environ.get('EMAIL_SEND_RETRY_BASE_SECONDS', '3'))
    EMAIL_RETRY_WORKER_ENABLED = os.environ.get('EMAIL_RETRY_WORKER_ENABLED', 'true').lower() == 'true'
    EMAIL_RETRY_INTERVAL_SECONDS = int(os.environ.get('EMAIL_RETRY_INTERVAL_SECONDS', '90'))
    EMAIL_FAILED_EVENT_MAX_RETRIES = int(os.environ.get('EMAIL_FAILED_EVENT_MAX_RETRIES', '5'))
    AUTO_SHORTLIST_WORKER_ENABLED = os.environ.get('AUTO_SHORTLIST_WORKER_ENABLED', 'true').lower() == 'true'
    AUTO_SHORTLIST_INTERVAL_SECONDS = int(os.environ.get('AUTO_SHORTLIST_INTERVAL_SECONDS', '60'))
    SHORTLIST_TRIGGER_DELAY_SECONDS = int(os.environ.get('SHORTLIST_TRIGGER_DELAY_SECONDS', '180'))
    MAX_CV_FILE_SIZE = 5 * 1024 * 1024  # 5 MB