import re
from collections import Counter

import fitz

from app.models.schemas import ResumeParsedData


def _extract_name(text: str) -> str | None:
    first_lines = [ln.strip() for ln in text.splitlines()[:8] if ln.strip()]
    if not first_lines:
        return None
    candidate = first_lines[0]
    if len(candidate.split()) <= 5 and not any(ch.isdigit() for ch in candidate):
        return candidate
    return None


def _extract_skills(text: str) -> list[str]:
    skill_bank = {
        "python",
        "java",
        "javascript",
        "typescript",
        "react",
        "next.js",
        "fastapi",
        "sql",
        "mongodb",
        "docker",
        "kubernetes",
        "aws",
        "azure",
        "git",
        "machine learning",
        "deep learning",
    }
    lower = text.lower()
    found = [skill for skill in skill_bank if skill in lower]
    return sorted(found)


def _extract_experience_years(text: str) -> float | None:
    matches = re.findall(r"(\d{1,2})\+?\s+years", text.lower())
    if not matches:
        return None
    values = [int(v) for v in matches]
    return float(max(values))


def parse_resume_pdf(file_bytes: bytes) -> ResumeParsedData:
    doc = fitz.open(stream=file_bytes, filetype="pdf")
    pages = [page.get_text("text") for page in doc]
    raw_text = "\n".join(pages)

    words = [w.strip(".,():;").lower() for w in raw_text.split() if len(w) > 3]
    common = [w for w, _ in Counter(words).most_common(40)]
    summary = " ".join(common[:25])

    return ResumeParsedData(
        name=_extract_name(raw_text),
        summary=summary,
        skills=_extract_skills(raw_text),
        experience_years=_extract_experience_years(raw_text),
        raw_text=raw_text,
    )
