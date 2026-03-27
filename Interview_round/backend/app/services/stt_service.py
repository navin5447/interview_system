import os
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

from faster_whisper import WhisperModel

from app.core.config import settings


@dataclass
class TranscriptionResult:
    transcript: str
    words_per_minute: float


class WhisperService:
    def __init__(self) -> None:
        try:
            self.model = WhisperModel(settings.whisper_model, compute_type=settings.whisper_compute_type)
        except Exception:
            self.model = WhisperModel(settings.whisper_model, compute_type="int8")

    @staticmethod
    def _suffix_from_mime(mime_type: str | None) -> str:
        if not mime_type:
            return ".webm"

        lowered = mime_type.lower()
        if "ogg" in lowered:
            return ".ogg"
        if "mp4" in lowered or "m4a" in lowered:
            return ".mp4"
        if "wav" in lowered:
            return ".wav"
        return ".webm"

    def transcribe_bytes(self, audio_bytes: bytes, mime_type: str | None = None) -> TranscriptionResult:
        suffix = self._suffix_from_mime(mime_type)
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as f:
            f.write(audio_bytes)
            path = f.name

        try:
            segments, _ = self.model.transcribe(path, beam_size=1, vad_filter=True, language="en")
            seg_list = list(segments)
            transcript = " ".join(seg.text.strip() for seg in seg_list).strip()
            words = len(transcript.split())
            duration = 0.0
            if seg_list:
                duration = max(0.1, seg_list[-1].end - seg_list[0].start)
            wpm = round((words / duration) * 60, 2) if duration > 0 else 0.0
            return TranscriptionResult(transcript=transcript, words_per_minute=wpm)
        finally:
            os.remove(path)

    def probe_duration_seconds(self, audio_path: str | Path) -> float:
        try:
            completed = subprocess.run(
                [
                    "ffprobe",
                    "-v",
                    "error",
                    "-show_entries",
                    "format=duration",
                    "-of",
                    "default=noprint_wrappers=1:nokey=1",
                    str(audio_path),
                ],
                capture_output=True,
                text=True,
                check=False,
            )
            if completed.returncode != 0:
                return 0.0
            value = (completed.stdout or "").strip()
            return round(max(0.0, float(value)), 2) if value else 0.0
        except Exception:
            return 0.0


whisper_service = WhisperService()
