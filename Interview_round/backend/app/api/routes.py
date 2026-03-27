import json
import time
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

from app.core.config import settings
from app.models.schemas import AnalyzeFrameRequest, EndSessionRequest, EvaluateRequest, EvaluateResponse, StartSessionRequest
from app.services.claude_service import groq_service
from app.services.emotion_service import analyze_frame
from app.services.report_service import build_report
from app.services.resume_parser import parse_resume_pdf
from app.services.session_service import (
    append_response,
    count_fillers,
    create_session,
    finalize_session,
    get_report_path,
    get_resume,
    get_session,
    get_session_bundle,
    save_emotion,
    save_report_record,
    save_resume,
    upsert_evaluation_result,
)
from app.services.stt_service import whisper_service
from app.services.tts_service import synthesize_tts_mp3
from app.services.ws_manager import ws_manager


router = APIRouter(prefix="/api", tags=["api"])


class TTSRequest(BaseModel):
    text: str


@router.post("/upload-resume")
async def upload_resume(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF resumes are supported")

    content = await file.read()
    parsed = parse_resume_pdf(content)
    resume_id = save_resume(file.filename, parsed)
    return {"resume_id": resume_id, "parsed_data": parsed.model_dump()}


@router.post("/start-session")
async def start_session(payload: StartSessionRequest):
    resume = get_resume(payload.resume_id)
    questions = groq_service.generate_questions(
        role=payload.role,
        resume_summary=resume.summary,
        resume_skills=resume.skills,
        hr_prompt=payload.hr_prompt,
        scenario_percentage=payload.scenario_percentage,
        resume_validation_percentage=payload.resume_validation_percentage,
        total_questions=payload.total_questions,
    )
    session_id = create_session(
        payload.resume_id,
        payload.role,
        questions,
        hr_prompt=payload.hr_prompt,
        interview_config={
            "scenario_percentage": payload.scenario_percentage,
            "resume_validation_percentage": payload.resume_validation_percentage,
            "total_questions": payload.total_questions,
        },
    )

    if questions:
        for idx, q in enumerate(questions, start=1):
            expected_answer = (q.expected_answer or "").strip()
            if not expected_answer:
                print(f"[QUESTION AUDIT] Q{idx} id={q.id} expected_answer is EMPTY")
            else:
                print(f"[QUESTION AUDIT] Q{idx} id={q.id} expected_answer='{expected_answer}'")

        await ws_manager.broadcast(
            session_id,
            "interview:question_start",
            {
                "question_text": questions[0].question,
                "question_number": 1,
            },
        )

    return {
        "session_id": session_id,
        "questions": [q.model_dump() for q in questions],
        "interview_config": {
            "scenario_percentage": payload.scenario_percentage,
            "resume_validation_percentage": payload.resume_validation_percentage,
            "total_questions": payload.total_questions,
        },
    }


@router.post("/transcribe")
async def transcribe_audio(
    session_id: str = Form(...),
    question_id: str = Form(...),
    question_text: str = Form(...),
    expected_keywords: str = Form("[]"),
    elapsed_seconds: float = Form(0.0),
    audio_mime_type: str = Form("audio/webm"),
    audio: UploadFile = File(...),
):
    content_type = (audio.content_type or "").lower()
    print(
        f"[AUDIO RECEIVE] session={session_id} question={question_id} filename={audio.filename or 'unknown'} "
        f"content_type={content_type or 'unknown'} audio_mime_type={audio_mime_type}"
    )

    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Received empty audio payload")

    if content_type and not content_type.startswith("audio/") and content_type != "application/octet-stream":
        raise HTTPException(status_code=400, detail=f"Unsupported audio content type: {audio.content_type}")

    print(f"[AUDIO RECEIVE] bytes={len(audio_bytes)}")

    ext = ".webm"
    lowered_mime = (audio_mime_type or "").lower()
    if "ogg" in lowered_mime:
        ext = ".ogg"
    elif "mp4" in lowered_mime or "m4a" in lowered_mime:
        ext = ".mp4"
    elif "wav" in lowered_mime:
        ext = ".wav"

    session_audio_dir = Path(settings.storage_dir) / "audio" / session_id / question_id
    session_audio_dir.mkdir(parents=True, exist_ok=True)
    chunk_path = session_audio_dir / f"{int(time.time() * 1000)}{ext}"
    chunk_path.write_bytes(audio_bytes)

    chunk_size = chunk_path.stat().st_size if chunk_path.exists() else 0
    audio_duration = whisper_service.probe_duration_seconds(chunk_path)
    print(
        f"[AUDIO SAVED] path={chunk_path} size={chunk_size} bytes duration={audio_duration:.2f}s"
    )

    try:
        result = whisper_service.transcribe_bytes(audio_bytes, mime_type=audio_mime_type)
        transcript = result.transcript
        words_per_minute = result.words_per_minute
        print(f"[TRANSCRIPT RAW] Question {question_id}: '{transcript}'")
    except Exception as err:
        print(f"[TRANSCRIPT ERROR] Question {question_id}: {err}")
        transcript = ""
        words_per_minute = 0.0

    if not transcript or not transcript.strip():
        print(f"[TRANSCRIPT WARN] Question {question_id}: transcript is empty or whitespace")

    print(f"[TRANSCRIPT] Question {question_id}: '{transcript}'")

    keywords = json.loads(expected_keywords)
    append_response(
        session_id=session_id,
        question_id=question_id,
        question_text=question_text,
        keywords=keywords,
        transcript_chunk=transcript,
        response_time=elapsed_seconds,
        audio_path=str(chunk_path),
    )

    filler_count = count_fillers(transcript)

    await ws_manager.broadcast(
        session_id,
        "interview:transcript_update",
        {"partial_transcript": transcript},
    )

    return {
        "transcript": transcript,
        "words_per_minute": words_per_minute,
        "filler_word_count": filler_count,
    }


@router.post("/analyze-frame")
async def analyze_frame_endpoint(payload: AnalyzeFrameRequest):
    result = analyze_frame(payload.image_base64)
    save_emotion(payload.session_id, result)

    await ws_manager.broadcast(
        payload.session_id,
        "interview:emotion_update",
        {"emotion": result.emotion, "confidence": result.confidence},
    )

    return {
        "emotion": result.emotion,
        "confidence": result.confidence,
        "timestamp": result.timestamp.isoformat(),
    }


@router.post("/evaluate", response_model=EvaluateResponse)
async def evaluate(payload: EvaluateRequest):
    transcript = payload.transcript.strip()
    session = get_session(payload.session_id)
    role = session["role"] if session else ""
    hr_prompt = (session["hr_prompt"] if session and "hr_prompt" in session.keys() else "") or ""

    resume_summary = ""
    session_questions = []
    if session:
        try:
            resume = get_resume(session["resume_id"])
            resume_summary = resume.summary
        except Exception:
            resume_summary = ""
        session_questions = json.loads(session["questions"] or "[]")

    question_meta = next((q for q in session_questions if q.get("id") == payload.question_id), {})
    question_type = payload.question_type or question_meta.get("type", "")
    assessment_focus = payload.assessment_focus or question_meta.get("assessment_focus", "")
    expected_answer = (question_meta.get("expected_answer") or "").strip()
    rubric = (question_meta.get("rubric") or "").strip()

    if not expected_answer:
        expected_answer = (
            "Candidate should answer with specific ownership, rationale, and measurable outcome aligned to the question."
        )
        print(f"[QUESTION AUDIT] question_id={payload.question_id} expected_answer missing; fallback generated")

    print(
        f"[EVAL INPUT] Q: {payload.question} | Expected: {expected_answer} | Got: {transcript}"
    )

    if not transcript:
        scores = {
            "correctness": None,
            "depth": None,
            "clarity": None,
            "relevance": None,
            "confidence": None,
            "hr_alignment": None,
            "overall": None,
            "resume_authenticity": "uncertain",
            "feedback": "No response provided. This question is not scored.",
            "scored": False,
        }
        follow_up = ""
    else:
        scores = groq_service.evaluate_response(
            question=payload.question,
            transcript=transcript,
            keywords=payload.keywords,
            expected_answer=expected_answer,
            rubric=rubric,
            role=role,
            hr_prompt=hr_prompt,
            question_type=question_type,
            resume_summary=resume_summary,
            assessment_focus=assessment_focus,
        )
        print(f"[EVAL NORMALIZED] {scores}")
        scores["scored"] = True
        follow_up = groq_service.generate_follow_up(transcript, float(scores.get("overall", 0) or 0))

    scores["dead_end_time_seconds"] = round(max(0.0, payload.dead_end_time_seconds), 2)
    scores["response_time_seconds"] = round(max(0.0, payload.response_time_seconds), 2)

    upsert_evaluation_result(
        session_id=payload.session_id,
        question_id=payload.question_id,
        question_text=payload.question,
        keywords=payload.keywords,
        transcript=transcript,
        response_time=payload.response_time_seconds,
        dead_end_time=payload.dead_end_time_seconds,
        scores=scores,
    )

    await ws_manager.broadcast(
        payload.session_id,
        "interview:evaluation_done",
        {"scores": scores, "follow_up": follow_up},
    )

    return {
        "scores": scores,
        "feedback": scores.get("feedback", ""),
        "follow_up": follow_up,
    }


@router.post("/end-session")
async def end_session(payload: EndSessionRequest):
    # Ensure every answered question has a score before generating the final report.
    bundle = get_session_bundle(payload.session_id)
    session = bundle.get("session", {})
    role = session.get("role", "")
    hr_prompt = session.get("hr_prompt", "") or ""
    resume_summary = ""
    try:
        if session.get("resume_id"):
            resume_summary = get_resume(session["resume_id"]).summary
    except Exception:
        resume_summary = ""

    response_by_qid = {item["question_id"]: item for item in bundle.get("responses", [])}

    for question in bundle.get("questions", []):
        question_id = question.get("id")
        if not question_id:
            continue

        response = response_by_qid.get(question_id)
        if not response:
            continue

        transcript = (response.get("transcript") or "").strip()
        if not transcript:
            continue

        existing_scores = response.get("scores") or {}
        already_scored = bool(existing_scores.get("scored", existing_scores.get("overall") is not None))
        if already_scored:
            continue

        eval_scores = groq_service.evaluate_response(
            question=question.get("question", ""),
            transcript=transcript,
            keywords=question.get("expected_keywords", []),
            expected_answer=(question.get("expected_answer") or ""),
            rubric=(question.get("rubric") or ""),
            role=role,
            hr_prompt=hr_prompt,
            question_type=question.get("type", ""),
            resume_summary=resume_summary,
            assessment_focus=question.get("assessment_focus", ""),
        )
        eval_scores["scored"] = True
        eval_scores["response_time_seconds"] = round(max(0.0, float(response.get("response_time") or 0.0)), 2)
        eval_scores["dead_end_time_seconds"] = round(max(0.0, float(response.get("dead_end_time") or 0.0)), 2)

        upsert_evaluation_result(
            session_id=payload.session_id,
            question_id=question_id,
            question_text=question.get("question", ""),
            keywords=question.get("expected_keywords", []),
            transcript=transcript,
            response_time=float(response.get("response_time") or 0.0),
            dead_end_time=float(response.get("dead_end_time") or 0.0),
            scores=eval_scores,
        )

    bundle = get_session_bundle(payload.session_id)
    report = build_report(bundle)

    report_id = report["report_id"]
    save_report_record(report_id, payload.session_id, Path(report["pdf_path"]))
    finalize_session(payload.session_id, report_id)

    await ws_manager.broadcast(payload.session_id, "interview:session_end", {"report_id": report_id})

    return report


@router.get("/report/{report_id}")
async def get_report(report_id: str):
    path = get_report_path(report_id)
    if not path:
        raise HTTPException(status_code=404, detail="Report not found")
    return FileResponse(path=path, filename=f"{report_id}.pdf", media_type="application/pdf")


@router.post("/tts")
async def tts(payload: TTSRequest):
    audio = synthesize_tts_mp3(payload.text)
    return StreamingResponse(iter([audio]), media_type="audio/mpeg")


@router.post("/complete-interview")
async def complete_interview(payload: dict):
    """
    Mark interview as complete and update SmartRecruit application status
    Expected payload: {
        "session_id": "session-uuid",
        "application_id": "app-id",
        "round_number": 3
    }
    """
    try:
        session_id = payload.get("session_id")
        application_id = payload.get("application_id")
        round_number = payload.get("round_number")
        round_score = payload.get("round_score", 0)
        evaluation_data = payload.get("evaluation_data") or {}
        
        if not all([session_id, application_id, round_number]):
            raise HTTPException(status_code=400, detail="Missing required fields")
        
        # Call SmartRecruit API to mark round as complete
        try:
            import urllib.request
            import json as json_lib
            
            smartrecruit_url = "http://127.0.0.1:5000/api/mark-round-complete"
            payload_data = {
                "application_id": application_id,
                "round_number": round_number,
                "status": "completed",
                "round_score": round_score,
                "evaluation_data": evaluation_data,
            }
            
            req = urllib.request.Request(
                smartrecruit_url,
                data=json_lib.dumps(payload_data).encode('utf-8'),
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            
            with urllib.request.urlopen(req, timeout=5) as response:
                result = json_lib.loads(response.read().decode('utf-8'))
                return {"success": True, "message": "Interview completed and SmartRecruit updated", "result": result}
        except Exception as e:
            # Even if SmartRecruit update fails, the interview is complete
            return {"success": True, "message": f"Interview completed (SmartRecruit update pending: {str(e)})"}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.websocket("/ws/interview/{session_id}")
async def interview_ws(websocket: WebSocket, session_id: str):
    await ws_manager.connect(session_id, websocket)
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                payload = json.loads(raw)
                event = payload.get("event")
                data = payload.get("data", {})
                if event == "interview:question_start":
                    await ws_manager.broadcast(session_id, event, data)
            except json.JSONDecodeError:
                continue
    except WebSocketDisconnect:
        await ws_manager.disconnect(session_id, websocket)