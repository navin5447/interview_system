import base64
from datetime import datetime

import cv2
import numpy as np
from deepface import DeepFace

from app.models.schemas import EmotionResult


EMOTION_MAP = {
    "happy": "Confident",
    "neutral": "Neutral",
    "sad": "Nervous",
    "fear": "Nervous",
    "angry": "Nervous",
    "surprise": "Neutral",
    "disgust": "Nervous",
}


def analyze_frame(image_base64: str) -> EmotionResult:
    raw = image_base64.split(",")[-1]
    image_bytes = base64.b64decode(raw)
    np_arr = np.frombuffer(image_bytes, np.uint8)
    image = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

    analysis = DeepFace.analyze(image, actions=["emotion"], enforce_detection=False, silent=True)
    if isinstance(analysis, list):
        analysis = analysis[0]

    dominant = analysis.get("dominant_emotion", "neutral")
    confidence = float(analysis.get("emotion", {}).get(dominant, 0.0))

    return EmotionResult(
        emotion=EMOTION_MAP.get(dominant, "Neutral"),
        confidence=round(confidence, 2),
        timestamp=datetime.utcnow(),
    )
