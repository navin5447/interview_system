import { FaceEvaluation, GazeDirection } from "./types";

export interface MinimalFaceResults {
  multiFaceLandmarks?: Array<Array<{ x: number; y: number; z?: number }>>;
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getPoint(landmarks: Array<{ x: number; y: number; z?: number }>, index: number) {
  return landmarks[index];
}

interface EyeMetrics {
  ear: number;
  horizontalIris: number;
  verticalIris: number;
}

const EAR_CLOSED_THRESHOLD = 0.12;
const EAR_LOW_OPEN_THRESHOLD = 0.2;
const EAR_OPEN_REFERENCE = 0.3;

function eyeOpennessPercentFromEar(ear: number): number {
  const normalized = clamp((ear - EAR_CLOSED_THRESHOLD) / (EAR_OPEN_REFERENCE - EAR_CLOSED_THRESHOLD), 0, 1);
  return normalized * 100;
}

function computeEyeMetrics(
  landmarks: Array<{ x: number; y: number; z?: number }>,
  cfg: {
    outerCorner: number;
    innerCorner: number;
    upperLid: number;
    lowerLid: number;
    irisCenter: number;
  }
): EyeMetrics | null {
  const outerCorner = getPoint(landmarks, cfg.outerCorner);
  const innerCorner = getPoint(landmarks, cfg.innerCorner);
  const upperLid = getPoint(landmarks, cfg.upperLid);
  const lowerLid = getPoint(landmarks, cfg.lowerLid);
  const irisCenter = getPoint(landmarks, cfg.irisCenter);

  if (!outerCorner || !innerCorner || !upperLid || !lowerLid || !irisCenter) {
    return null;
  }

  const eyeWidth = Math.max(distance(outerCorner, innerCorner), 0.0001);
  const eyeHeight = Math.max(distance(upperLid, lowerLid), 0.0001);

  const horizontalIris = clamp(
    (irisCenter.x - outerCorner.x) / (innerCorner.x - outerCorner.x + 0.0001),
    0,
    1
  );
  const verticalIris = clamp((irisCenter.y - upperLid.y) / (lowerLid.y - upperLid.y + 0.0001), 0, 1);

  return {
    ear: eyeHeight / eyeWidth,
    horizontalIris,
    verticalIris
  };
}

function estimateGazeDirection(
  landmarks: Array<{ x: number; y: number; z?: number }>
): { gazeDirection: GazeDirection; eyesClosed: boolean; irisDown: boolean; horizontal: number | null; vertical: number | null } {
  const leftEye = computeEyeMetrics(landmarks, {
    outerCorner: 33,
    innerCorner: 133,
    upperLid: 159,
    lowerLid: 145,
    irisCenter: 468
  });

  const rightEye = computeEyeMetrics(landmarks, {
    outerCorner: 362,
    innerCorner: 263,
    upperLid: 386,
    lowerLid: 374,
    irisCenter: 473
  });

  if (!leftEye || !rightEye) {
    return { gazeDirection: "unknown", eyesClosed: false, irisDown: false, horizontal: null, vertical: null };
  }

  const avgOpenRatio = (leftEye.ear + rightEye.ear) / 2;
  const eyesClosed = avgOpenRatio < EAR_CLOSED_THRESHOLD;
  if (eyesClosed) {
    return {
      gazeDirection: "forward",
      eyesClosed: true,
      irisDown: false,
      horizontal: (leftEye.horizontalIris + rightEye.horizontalIris) / 2,
      vertical: (leftEye.verticalIris + rightEye.verticalIris) / 2
    };
  }

  const horizontal = (leftEye.horizontalIris + rightEye.horizontalIris) / 2;
  const vertical = (leftEye.verticalIris + rightEye.verticalIris) / 2;

  if (horizontal < 0.35) {
    return { gazeDirection: "left", eyesClosed: false, irisDown: false, horizontal, vertical };
  }

  if (horizontal > 0.65) {
    return { gazeDirection: "right", eyesClosed: false, irisDown: false, horizontal, vertical };
  }

  if (vertical > 0.65) {
    return { gazeDirection: "down", eyesClosed: false, irisDown: true, horizontal, vertical };
  }

  if (vertical < 0.35) {
    return { gazeDirection: "up", eyesClosed: false, irisDown: false, horizontal, vertical };
  }

  return { gazeDirection: "forward", eyesClosed: false, irisDown: false, horizontal, vertical };
}

// Evaluates face orientation and approximate distance from normalized landmarks.
export function evaluateFaceResults(results: MinimalFaceResults): FaceEvaluation {
  const faces = results.multiFaceLandmarks ?? [];

  if (faces.length === 0) {
    return {
      status: "no_face",
      faceCount: 0,
      gazeDirection: "unknown",
      eyesClosed: false,
      reducedEyeOpenness: false,
      eyeAspectRatio: 0,
      eyeOpennessPercent: 0,
      headPitchDown: false,
      downSignal: false,
      faceWidthRatio: 0,
      irisHorizontalRatio: null,
      irisVerticalRatio: null
    };
  }

  if (faces.length > 1) {
    return {
      status: "multiple_faces",
      faceCount: faces.length,
      gazeDirection: "unknown",
      eyesClosed: false,
      reducedEyeOpenness: false,
      eyeAspectRatio: 0,
      eyeOpennessPercent: 0,
      headPitchDown: false,
      downSignal: false,
      faceWidthRatio: 0,
      irisHorizontalRatio: null,
      irisVerticalRatio: null
    };
  }

  const landmarks = faces[0];

  const leftEyeOuter = landmarks[33];
  const rightEyeOuter = landmarks[263];
  const noseTip = landmarks[1];
  const chin = landmarks[152];
  const leftCheek = landmarks[234];
  const rightCheek = landmarks[454];

  if (!leftEyeOuter || !rightEyeOuter || !noseTip || !chin || !leftCheek || !rightCheek) {
    return {
      status: "face_ok",
      faceCount: 1,
      gazeDirection: "unknown",
      eyesClosed: false,
      reducedEyeOpenness: false,
      eyeAspectRatio: 0,
      eyeOpennessPercent: 0,
      headPitchDown: false,
      downSignal: false,
      faceWidthRatio: 0,
      irisHorizontalRatio: null,
      irisVerticalRatio: null
    };
  }

  const eyeDistance = Math.max(distance(leftEyeOuter, rightEyeOuter), 0.0001);
  const noseCenterOffset = (noseTip.x - (leftEyeOuter.x + rightEyeOuter.x) / 2) / eyeDistance;

  const faceWidth = distance(leftCheek, rightCheek);
  const eyesY = (leftEyeOuter.y + rightEyeOuter.y) / 2;
  const verticalRatio = (noseTip.y - eyesY) / Math.max(chin.y - eyesY, 0.0001);

  const lookingLeftOrRight = Math.abs(noseCenterOffset) > 0.2;
  const headPitchDown = verticalRatio > 0.68;
  const gaze = estimateGazeDirection(landmarks);
  const leftUpper = getPoint(landmarks, 159);
  const leftLower = getPoint(landmarks, 145);
  const leftOuter = getPoint(landmarks, 33);
  const leftInner = getPoint(landmarks, 133);
  const rightUpper = getPoint(landmarks, 386);
  const rightLower = getPoint(landmarks, 374);
  const rightOuter = getPoint(landmarks, 362);
  const rightInner = getPoint(landmarks, 263);

  const leftEar =
    leftUpper && leftLower && leftOuter && leftInner
      ? Math.max(distance(leftUpper, leftLower) / Math.max(distance(leftOuter, leftInner), 0.0001), 0)
      : 0;
  const rightEar =
    rightUpper && rightLower && rightOuter && rightInner
      ? Math.max(distance(rightUpper, rightLower) / Math.max(distance(rightOuter, rightInner), 0.0001), 0)
      : 0;
  const eyeAspectRatio = (leftEar + rightEar) / 2;
  const reducedEyeOpenness = eyeAspectRatio < EAR_LOW_OPEN_THRESHOLD && eyeAspectRatio >= EAR_CLOSED_THRESHOLD;
  const eyeOpennessPercent = eyeOpennessPercentFromEar(eyeAspectRatio);

  if (lookingLeftOrRight || gaze.gazeDirection === "left" || gaze.gazeDirection === "right") {
    return {
      status: "looking_away",
      faceCount: 1,
      gazeDirection: gaze.gazeDirection,
      eyesClosed: gaze.eyesClosed,
      reducedEyeOpenness,
      eyeAspectRatio,
      eyeOpennessPercent,
      headPitchDown,
      downSignal: gaze.irisDown || headPitchDown,
      faceWidthRatio: faceWidth,
      irisHorizontalRatio: gaze.horizontal,
      irisVerticalRatio: gaze.vertical
    };
  }

  if (faceWidth < 0.16) {
    return {
      status: "face_distance_abnormal",
      faceCount: 1,
      gazeDirection: gaze.gazeDirection,
      eyesClosed: gaze.eyesClosed,
      reducedEyeOpenness,
      eyeAspectRatio,
      eyeOpennessPercent,
      headPitchDown,
      downSignal: gaze.irisDown || headPitchDown,
      faceWidthRatio: faceWidth,
      irisHorizontalRatio: gaze.horizontal,
      irisVerticalRatio: gaze.vertical
    };
  }

  return {
    status: "face_ok",
    faceCount: 1,
    gazeDirection: gaze.gazeDirection,
    eyesClosed: gaze.eyesClosed,
    reducedEyeOpenness,
    eyeAspectRatio,
    eyeOpennessPercent,
    headPitchDown,
    downSignal: gaze.irisDown || headPitchDown,
    faceWidthRatio: faceWidth,
    irisHorizontalRatio: gaze.horizontal,
    irisVerticalRatio: gaze.vertical
  };
}

export function drawFaceLandmarks(
  canvas: HTMLCanvasElement,
  results: MinimalFaceResults,
  status: FaceEvaluation["status"],
  drawIris = true
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const faces = results.multiFaceLandmarks ?? [];
  const pointColor = status === "face_ok" ? "#30f18d" : "#ffb347";
  const irisColor = "#5bc0ff";
  const irisIndices = new Set([468, 469, 470, 471, 472, 473, 474, 475, 476, 477]);

  for (const landmarks of faces) {
    for (let index = 0; index < landmarks.length; index += 1) {
      const point = landmarks[index];
      const x = point.x * canvas.width;
      const y = point.y * canvas.height;
      ctx.beginPath();
      const isIrisPoint = drawIris && irisIndices.has(index);
      ctx.arc(x, y, isIrisPoint ? 2.6 : 1.5, 0, Math.PI * 2);
      ctx.fillStyle = isIrisPoint ? irisColor : pointColor;
      ctx.fill();
    }
  }
}
