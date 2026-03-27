import uuid
from datetime import datetime
from pathlib import Path

import matplotlib.pyplot as plt
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from app.core.config import settings
from app.core.database import get_mongo_collection
from app.services.session_service import count_fillers


EMOTION_SCORE = {
    "Confident": 9,
    "Neutral": 6,
    "Nervous": 4,
}


def _recommend(overall: float) -> str:
    return "hire" if overall >= 7 else "no-hire"


def _make_emotion_chart(emotions: list[dict], output_path: Path) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    x = list(range(1, len(emotions) + 1))
    y = [EMOTION_SCORE.get(item["emotion"], 5) for item in emotions]

    plt.figure(figsize=(7, 2.5))
    plt.plot(x, y, marker="o")
    plt.ylim(0, 10)
    plt.title("Emotion Timeline")
    plt.xlabel("Frame")
    plt.ylabel("Confidence Mood Score")
    plt.tight_layout()
    plt.savefig(output_path)
    plt.close()
    return output_path


def build_report(session_bundle: dict) -> dict:
    questions = session_bundle["questions"]
    responses = session_bundle["responses"]
    emotions = session_bundle["emotions"]

    response_by_qid = {item["question_id"]: item for item in responses}

    per_question = []
    scored_overall_values: list[float] = []
    scored_correctness_values: list[float] = []
    scored_clarity_values: list[float] = []
    strengths = []
    improvements = []

    for q in questions:
        item = response_by_qid.get(q["id"])
        if not item:
            per_question.append(
                {
                    "question_id": q["id"],
                    "question": q["question"],
                    "response_time": 0.0,
                    "dead_end_time": 0.0,
                    "scores": {
                        "correctness": None,
                        "depth": None,
                        "clarity": None,
                        "relevance": None,
                        "overall": None,
                        "scored": False,
                    },
                    "feedback": "No response provided. This question is not scored.",
                }
            )
            continue

        scores = item.get("scores") or {}
        scored = bool(scores.get("scored", scores.get("overall") is not None))

        per_question.append(
            {
                "question_id": q["id"],
                "question": q["question"],
                "response_time": round(float(item.get("response_time") or 0.0), 2),
                "dead_end_time": round(float(item.get("dead_end_time") or 0.0), 2),
                "scores": scores,
                "feedback": scores.get("feedback", "No feedback available."),
            }
        )

        if not scored:
            continue

        overall = float(scores.get("overall", 0) or 0)
        correctness = float(scores.get("correctness", 0) or 0)
        clarity = float(scores.get("clarity", 0) or 0)
        scored_overall_values.append(overall)
        scored_correctness_values.append(correctness)
        scored_clarity_values.append(clarity)

        if overall >= 7:
            strengths.append(q["question"])
        else:
            improvements.append(q["question"])

    avg_response_time = round(
        sum(item["response_time"] for item in per_question) / max(1, len(per_question)),
        2,
    )
    avg_dead_end_time = round(
        sum(item["dead_end_time"] for item in per_question) / max(1, len(per_question)),
        2,
    )
    filler_word_count = sum(count_fillers(item["transcript"]) for item in responses)

    total_words = sum(len(item["transcript"].split()) for item in responses)
    total_minutes = sum(item["response_time"] for item in responses) / 60 if responses else 0
    speech_pace = round(total_words / total_minutes, 2) if total_minutes else 0.0

    emotion_avg = 0.0
    if emotions:
        emotion_avg = sum(EMOTION_SCORE.get(e["emotion"], 5) for e in emotions) / len(emotions)

    avg_correctness = sum(scored_correctness_values) / max(1, len(scored_correctness_values))
    avg_clarity = sum(scored_clarity_values) / max(1, len(scored_clarity_values))
    confidence_score = round((avg_correctness * 0.4) + (avg_clarity * 0.3) + (emotion_avg * 0.3), 2)

    overall = round(sum(scored_overall_values) / max(1, len(scored_overall_values)), 2)

    report_id = str(uuid.uuid4())
    now = datetime.utcnow()
    chart_path = Path(settings.storage_dir) / "reports" / f"{report_id}_emotion.png"
    pdf_path = Path(settings.storage_dir) / "reports" / f"{report_id}.pdf"

    _make_emotion_chart(emotions, chart_path)
    _render_pdf(pdf_path, chart_path, session_bundle, per_question, overall, confidence_score)

    report = {
        "report_id": report_id,
        "candidate_name": "Candidate",
        "role": session_bundle["session"]["role"],
        "date": now.isoformat(),
        "per_question": per_question,
        "emotion_timeline": emotions,
        "avg_response_time": avg_response_time,
        "avg_dead_end_time": avg_dead_end_time,
        "filler_word_count": filler_word_count,
        "speech_pace": speech_pace,
        "confidence_score": confidence_score,
        "overall_score": overall,
        "recommendation": _recommend(overall),
        "top_strengths": strengths[:3],
        "improvement_areas": improvements[:2],
        "pdf_path": str(pdf_path),
    }

    try:
        coll = get_mongo_collection()
        coll.insert_one(dict(report))
    except Exception:
        report["mongo_warning"] = "MongoDB unavailable; report only persisted locally"

    report.pop("_id", None)

    return report


def _render_pdf(pdf_path: Path, chart_path: Path, session_bundle: dict, per_question: list[dict], overall: float, confidence_score: float) -> None:
    c = canvas.Canvas(str(pdf_path), pagesize=A4)
    width, height = A4
    y = height - 40

    c.setFont("Helvetica-Bold", 16)
    c.drawString(40, y, "AI Interview Report")
    y -= 24

    c.setFont("Helvetica", 11)
    c.drawString(40, y, f"Role: {session_bundle['session']['role']}")
    y -= 16
    c.drawString(40, y, f"Date: {datetime.utcnow().isoformat()}")
    y -= 24

    c.drawString(40, y, f"Overall Score: {overall}")
    y -= 16
    c.drawString(40, y, f"Confidence Score: {confidence_score}")
    y -= 24

    c.setFont("Helvetica-Bold", 12)
    c.drawString(40, y, "Per-Question Feedback")
    y -= 18

    c.setFont("Helvetica", 10)
    for item in per_question[:6]:
        overall_score = item["scores"].get("overall")
        if overall_score is None:
            line = (
                f"- {item['question_id']}: not scored, response_time={item['response_time']}s, "
                f"dead_end={item['dead_end_time']}s"
            )
        else:
            line = (
                f"- {item['question_id']}: overall={overall_score}, response_time={item['response_time']}s, "
                f"dead_end={item['dead_end_time']}s"
            )
        c.drawString(45, y, line[:100])
        y -= 14
        if y < 140:
            c.showPage()
            y = height - 40
            c.setFont("Helvetica", 10)

    if y < 240:
        c.showPage()
        y = height - 40

    c.drawImage(str(chart_path), 40, y - 180, width=500, height=180, preserveAspectRatio=True)
    c.save()
