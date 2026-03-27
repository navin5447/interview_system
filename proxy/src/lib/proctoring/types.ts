import { ProctoringSeverity, RoundType } from "./roundPolicies";

export type ProctoringEventType =
  | "no_face_detected"
  | "multiple_faces_detected"
  | "looking_away"
  | "looking_down"
  | "possible_downward_attention"
  | "cell_phone_detected"
  | "background_person_detected"
  | "face_distance_abnormal"
  | "background_speech_detected"
  | "high_noise_detected";

export interface ProctoringEvent {
  candidateId: string;
  sessionId: string;
  roundType: RoundType;
  event_type: ProctoringEventType;
  severity: ProctoringSeverity;
  duration_ms?: number;
  timestamp: number;
}

export type FaceStatus = "face_ok" | "no_face" | "multiple_faces" | "looking_away" | "face_distance_abnormal";

export interface FaceEvaluation {
  status: FaceStatus;
  faceCount: number;
  gazeDirection: GazeDirection;
  eyesClosed: boolean;
  reducedEyeOpenness: boolean;
  eyeAspectRatio: number;
  eyeOpennessPercent: number;
  headPitchDown: boolean;
  downSignal: boolean;
  faceWidthRatio: number;
  irisHorizontalRatio: number | null;
  irisVerticalRatio: number | null;
}

export type GazeDirection = "unknown" | "forward" | "down" | "left" | "right" | "up";

export interface AudioMetrics {
  // Normalized RMS level in range [0, 1]
  level: number;
  // Indicates likely speech-like activity in the input stream.
  speechActive: boolean;
  // True when medium-level sound persists for a sustained period.
  continuousSound: boolean;
  // True on sudden loud spikes.
  suddenLoudNoise: boolean;
}

export type PermissionState = "idle" | "requesting" | "granted" | "denied";
