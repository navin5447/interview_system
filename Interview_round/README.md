# AI Voice + Video Interview System

Full-stack interview platform with Next.js 14 frontend and FastAPI backend.

## Stack
- Frontend: Next.js 14, TypeScript, Tailwind CSS
- Backend: FastAPI (Python 3.11+)
- STT: faster-whisper
- TTS: Web Speech API
- LLM: Groq API (OpenAI-compatible chat completions)
- Resume parsing: PyMuPDF
- Emotion: DeepFace + OpenCV
- DB: SQLite (sessions) + MongoDB (reports)
- Real-time: WebSocket events, WebRTC media primitives

## Backend Setup
1. `cd backend`
2. `python -m venv .venv && source .venv/bin/activate`
3. `pip install -r requirements.txt`
4. `cp .env.example .env` and set `GROQ_API_KEY`
5. `uvicorn app.main:app --reload --port 8000`

## Frontend Setup
1. `cd frontend`
2. `npm install`
3. `cp .env.example .env.local`
4. `npm run dev`

## API Endpoints
- `POST /api/upload-resume`
- `POST /api/start-session`
- `POST /api/transcribe`
- `POST /api/analyze-frame`
- `POST /api/evaluate`
- `POST /api/end-session`
- `GET /api/report/{id}`
- `WS /api/ws/interview/{session_id}`

## WebSocket Events
- `interview:question_start`
- `interview:transcript_update`
- `interview:emotion_update`
- `interview:evaluation_done`
- `interview:session_end`
## Notes
- Whisper uses configured `float16` and falls back to `int8` if unavailable.
- DeepFace emotion inference uses `enforce_detection=False`.
- Audio chunks are saved under `backend/storage/audio` for audit trail.