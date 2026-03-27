import { ProctoringEventType } from "./types";

export type RoundType = "mcq" | "aptitude" | "coding" | "technical";
export type ProctoringSeverity = "low" | "medium" | "high";

export interface RoundEventRule {
  enabled: boolean;
  minDurationMs: number;
  severity: ProctoringSeverity;
}

export interface RoundAudioPolicy {
  calibrationMs: number;
  speechDurationMs: number;
  backgroundNoiseDurationMs: number;
  continuousLoudDurationMs: number;
  noiseMultiplier: number;
  loudMultiplier: number;
  loudSpikeDelta: number;
  repeatedLoudSpikeWindowMs: number;
  repeatedLoudSpikeCount: number;
  monitorSpeechViolation: boolean;
  monitorBackgroundNoise: boolean;
  monitorSpikeNoise: boolean;
  monitorRepeatedSpikes: boolean;
}

export interface RoundPolicy {
  roundType: RoundType;
  events: Record<ProctoringEventType, RoundEventRule>;
  audio: RoundAudioPolicy;
}

function disabledRule(severity: ProctoringSeverity = "low"): RoundEventRule {
  return {
    enabled: false,
    minDurationMs: 0,
    severity
  };
}

export const ROUND_POLICIES: Record<RoundType, RoundPolicy> = {
  mcq: {
    roundType: "mcq",
    events: {
      no_face_detected: { enabled: true, minDurationMs: 1000, severity: "high" },
      multiple_faces_detected: { enabled: true, minDurationMs: 700, severity: "high" },
      looking_away: { enabled: true, minDurationMs: 1000, severity: "medium" },
      looking_down: { enabled: true, minDurationMs: 5000, severity: "medium" },
      possible_downward_attention: { enabled: true, minDurationMs: 2000, severity: "high" },
      cell_phone_detected: { enabled: true, minDurationMs: 0, severity: "high" },
      background_person_detected: { enabled: true, minDurationMs: 1000, severity: "high" },
      face_distance_abnormal: disabledRule("low"),
      background_speech_detected: { enabled: true, minDurationMs: 1000, severity: "high" },
      high_noise_detected: { enabled: true, minDurationMs: 700, severity: "high" }
    },
    audio: {
      calibrationMs: 3000,
      speechDurationMs: 1000,
      backgroundNoiseDurationMs: 2000,
      continuousLoudDurationMs: 2000,
      noiseMultiplier: 1.9,
      loudMultiplier: 3.1,
      loudSpikeDelta: 0.09,
      repeatedLoudSpikeWindowMs: 3500,
      repeatedLoudSpikeCount: 2,
      monitorSpeechViolation: true,
      monitorBackgroundNoise: true,
      monitorSpikeNoise: true,
      monitorRepeatedSpikes: true
    }
  },
  aptitude: {
    roundType: "aptitude",
    events: {
      no_face_detected: { enabled: true, minDurationMs: 3000, severity: "high" },
      multiple_faces_detected: { enabled: true, minDurationMs: 1000, severity: "high" },
      looking_away: { enabled: true, minDurationMs: 2000, severity: "medium" },
      looking_down: { enabled: true, minDurationMs: 10000, severity: "low" },
      possible_downward_attention: { enabled: true, minDurationMs: 2000, severity: "medium" },
      cell_phone_detected: { enabled: true, minDurationMs: 0, severity: "high" },
      background_person_detected: { enabled: true, minDurationMs: 1000, severity: "high" },
      face_distance_abnormal: disabledRule("low"),
      background_speech_detected: { enabled: true, minDurationMs: 3000, severity: "high" },
      high_noise_detected: { enabled: true, minDurationMs: 3000, severity: "high" }
    },
    audio: {
      calibrationMs: 3000,
      speechDurationMs: 3000,
      backgroundNoiseDurationMs: 3000,
      continuousLoudDurationMs: 3000,
      noiseMultiplier: 2.4,
      loudMultiplier: 3.9,
      loudSpikeDelta: 0.16,
      repeatedLoudSpikeWindowMs: 7000,
      repeatedLoudSpikeCount: 99,
      monitorSpeechViolation: true,
      monitorBackgroundNoise: true,
      monitorSpikeNoise: false,
      monitorRepeatedSpikes: false
    }
  },
  coding: {
    roundType: "coding",
    events: {
      no_face_detected: { enabled: true, minDurationMs: 5000, severity: "high" },
      multiple_faces_detected: { enabled: true, minDurationMs: 1000, severity: "high" },
      looking_away: { enabled: true, minDurationMs: 10000, severity: "medium" },
      looking_down: { enabled: true, minDurationMs: 15000, severity: "low" },
      possible_downward_attention: { enabled: true, minDurationMs: 2000, severity: "medium" },
      cell_phone_detected: { enabled: true, minDurationMs: 0, severity: "high" },
      background_person_detected: { enabled: true, minDurationMs: 1000, severity: "high" },
      face_distance_abnormal: disabledRule("low"),
      background_speech_detected: { enabled: true, minDurationMs: 4000, severity: "medium" },
      high_noise_detected: { enabled: true, minDurationMs: 4000, severity: "high" }
    },
    audio: {
      calibrationMs: 3000,
      speechDurationMs: 4000,
      backgroundNoiseDurationMs: 4000,
      continuousLoudDurationMs: 4000,
      noiseMultiplier: 2.3,
      loudMultiplier: 3.7,
      loudSpikeDelta: 0.15,
      repeatedLoudSpikeWindowMs: 8000,
      repeatedLoudSpikeCount: 3,
      monitorSpeechViolation: true,
      monitorBackgroundNoise: false,
      monitorSpikeNoise: false,
      monitorRepeatedSpikes: false
    }
  },
  technical: {
    roundType: "technical",
    events: {
      no_face_detected: { enabled: true, minDurationMs: 5000, severity: "high" },
      multiple_faces_detected: { enabled: true, minDurationMs: 1000, severity: "high" },
      looking_away: disabledRule("low"),
      looking_down: disabledRule("low"),
      possible_downward_attention: disabledRule("low"),
      cell_phone_detected: { enabled: true, minDurationMs: 0, severity: "high" },
      background_person_detected: { enabled: true, minDurationMs: 1000, severity: "high" },
      face_distance_abnormal: disabledRule("low"),
      background_speech_detected: { enabled: true, minDurationMs: 3000, severity: "medium" },
      high_noise_detected: { enabled: true, minDurationMs: 4000, severity: "high" }
    },
    audio: {
      calibrationMs: 3000,
      speechDurationMs: 3000,
      backgroundNoiseDurationMs: 4000,
      continuousLoudDurationMs: 4000,
      noiseMultiplier: 2.2,
      loudMultiplier: 3.4,
      loudSpikeDelta: 0.14,
      repeatedLoudSpikeWindowMs: 7000,
      repeatedLoudSpikeCount: 3,
      monitorSpeechViolation: true,
      monitorBackgroundNoise: true,
      monitorSpikeNoise: false,
      monitorRepeatedSpikes: false
    }
  }
};

export function getRoundPolicy(roundType: RoundType): RoundPolicy {
  return ROUND_POLICIES[roundType] ?? ROUND_POLICIES.technical;
}
