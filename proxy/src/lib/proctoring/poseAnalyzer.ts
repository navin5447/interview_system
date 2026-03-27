export interface PoseLandmarkLike {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

export interface MinimalPoseResults {
  poseLandmarks?: PoseLandmarkLike[];
}

export interface NormalizedBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface PosePresenceEvaluation {
  personCount: number;
  validLandmarkCount: number;
  backgroundPersonDetected: boolean;
}

const MAJOR_LANDMARK_INDICES = [0, 11, 12, 23, 24, 13, 14, 25, 26];
const POSE_CONNECTIONS: Array<[number, number]> = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [25, 27],
  [24, 26],
  [26, 28]
];

function isVisible(landmark: PoseLandmarkLike | undefined, threshold: number): boolean {
  return Boolean(landmark && (landmark.visibility ?? 0) > threshold);
}

function expandBounds(bounds: NormalizedBounds, ratio: number): NormalizedBounds {
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;

  return {
    minX: Math.max(0, bounds.minX - width * ratio),
    maxX: Math.min(1, bounds.maxX + width * ratio),
    minY: Math.max(0, bounds.minY - height * ratio),
    maxY: Math.min(1, bounds.maxY + height * ratio)
  };
}

function inBounds(point: PoseLandmarkLike, bounds: NormalizedBounds): boolean {
  return point.x >= bounds.minX && point.x <= bounds.maxX && point.y >= bounds.minY && point.y <= bounds.maxY;
}

export function evaluatePosePresence(results: MinimalPoseResults, faceBounds: NormalizedBounds | null): PosePresenceEvaluation {
  const landmarks = results.poseLandmarks ?? [];
  if (landmarks.length === 0) {
    return {
      personCount: 0,
      validLandmarkCount: 0,
      backgroundPersonDetected: false
    };
  }

  const majorVisible = MAJOR_LANDMARK_INDICES
    .map((index) => landmarks[index])
    .filter((landmark) => isVisible(landmark, 0.5));

  const validLandmarkCount = majorVisible.length;
  const validPerson = validLandmarkCount >= 5;

  if (!validPerson) {
    return {
      personCount: 0,
      validLandmarkCount,
      backgroundPersonDetected: false
    };
  }

  let backgroundPersonDetected = false;
  let personCount = 1;

  if (faceBounds) {
    const expandedFace = expandBounds(faceBounds, 0.45);
    const outsideCount = majorVisible.filter((landmark) => !inBounds(landmark, expandedFace)).length;
    const outsideRatio = outsideCount / Math.max(majorVisible.length, 1);

    // If most visible body landmarks are outside the candidate face area,
    // treat as a likely additional background person.
    backgroundPersonDetected = outsideRatio >= 0.6;
    if (backgroundPersonDetected) {
      personCount = 2;
    }
  }

  return {
    personCount,
    validLandmarkCount,
    backgroundPersonDetected
  };
}

export function drawPoseSkeleton(canvas: HTMLCanvasElement, results: MinimalPoseResults): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  const landmarks = results.poseLandmarks ?? [];
  if (landmarks.length === 0) {
    return;
  }

  ctx.save();
  ctx.strokeStyle = "#f5d142";
  ctx.lineWidth = 2;

  for (const [startIndex, endIndex] of POSE_CONNECTIONS) {
    const start = landmarks[startIndex];
    const end = landmarks[endIndex];

    if (!isVisible(start, 0.45) || !isVisible(end, 0.45)) {
      continue;
    }

    ctx.beginPath();
    ctx.moveTo(start.x * canvas.width, start.y * canvas.height);
    ctx.lineTo(end.x * canvas.width, end.y * canvas.height);
    ctx.stroke();
  }

  ctx.fillStyle = "#ffd166";
  for (const index of MAJOR_LANDMARK_INDICES) {
    const landmark = landmarks[index];
    if (!isVisible(landmark, 0.45)) {
      continue;
    }

    ctx.beginPath();
    ctx.arc(landmark.x * canvas.width, landmark.y * canvas.height, 2.8, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}
