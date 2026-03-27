import { ProctoringEvent, ProctoringEventType } from "./types";
const MCQ_EVENT_COUNT_COOLDOWN_MS = 2000;
const APTITUDE_EVENT_COUNT_COOLDOWN_MS = 2000;
const CODING_EVENT_COUNT_COOLDOWN_MS = 2000;
const TECHNICAL_EVENT_COUNT_COOLDOWN_MS = 2000;

type EventCounts = Record<ProctoringEventType, number>;

const SUPPORTED_EVENT_TYPES = new Set<ProctoringEventType>([
  "cell_phone_detected",
  "looking_away",
  "looking_down",
  "multiple_faces_detected",
  "background_person_detected",
  "no_face_detected",
  "background_speech_detected",
  "high_noise_detected",
  "face_distance_abnormal",
  "possible_downward_attention"
]);

const CRITICAL_EVENTS = new Set<ProctoringEventType>([
  "cell_phone_detected",
  "background_person_detected",
  "multiple_faces_detected"
]);

const SUSPICIOUS_EVENTS = new Set<ProctoringEventType>([
  "looking_away",
  "looking_down",
  "background_speech_detected"
]);

const MINOR_EVENTS = new Set<ProctoringEventType>(["high_noise_detected", "face_distance_abnormal"]);

export type IntegrityStatus = "clean" | "slightly_suspicious" | "review_required" | "high_risk";

export interface IntegrityData {
  integrityScore: number;
  integrityStatus: IntegrityStatus;
  eventCounts: EventCounts;
  lastUpdated: number;
}

export interface ScoringDecision {
  counted: boolean;
  reason: string;
  newCount: number;
  scoreDelta: number;
}

function createEmptyEventCounts(): EventCounts {
  return {
    no_face_detected: 0,
    multiple_faces_detected: 0,
    looking_away: 0,
    looking_down: 0,
    possible_downward_attention: 0,
    cell_phone_detected: 0,
    background_person_detected: 0,
    face_distance_abnormal: 0,
    background_speech_detected: 0,
    high_noise_detected: 0
  };
}

function getMcqIntegrityStatus(score: number): IntegrityStatus {
  if (score >= 90) return "clean";
  if (score >= 75) return "slightly_suspicious";
  if (score >= 60) return "review_required";
  return "high_risk";
}

function getAptitudeIntegrityStatus(score: number): IntegrityStatus {
  if (score >= 90) return "clean";
  if (score >= 75) return "slightly_suspicious";
  if (score >= 60) return "review_required";
  return "high_risk";
}

function getCodingIntegrityStatus(score: number): IntegrityStatus {
  if (score >= 90) return "clean";
  if (score >= 75) return "slightly_suspicious";
  if (score >= 60) return "review_required";
  return "high_risk";
}

function getTechnicalIntegrityStatus(score: number): IntegrityStatus {
  if (score >= 90) return "clean";
  if (score >= 75) return "slightly_suspicious";
  if (score >= 60) return "review_required";
  return "high_risk";
}

function normalizeRoundType(roundType: string): string {
  return roundType.trim().toLowerCase();
}

function normalizeEventType(eventType: string): ProctoringEventType | null {
  const normalized = eventType.trim().toLowerCase();

  const aliasMap: Record<string, ProctoringEventType> = {
    phone_detected: "cell_phone_detected",
    looking_away_detected: "looking_away",
    no_face: "no_face_detected",
    multiple_faces: "multiple_faces_detected",
    possible_downward_attention: "looking_down"
  };

  const canonical = (aliasMap[normalized] ?? normalized) as ProctoringEventType;
  if (!SUPPORTED_EVENT_TYPES.has(canonical)) {
    return null;
  }

  return canonical;
}

function getPenaltyForOccurrence(eventType: ProctoringEventType, count: number): number {
  if (CRITICAL_EVENTS.has(eventType)) {
    if (count >= 3) return 25;
    if (count >= 2) return 15;
    return 0;
  }

  if (eventType === "no_face_detected") {
    if (count >= 4) return 10;
    if (count >= 2) return 5;
    return 0;
  }

  if (SUSPICIOUS_EVENTS.has(eventType)) {
    if (count >= 7) return 6;
    if (count >= 4) return 3;
    return 0;
  }

  if (MINOR_EVENTS.has(eventType)) {
    if (count > 5) return 2;
    return 0;
  }

  return 0;
}

function getAptitudePenaltyForOccurrence(eventType: ProctoringEventType): number {
  switch (eventType) {
    case "cell_phone_detected":
      return 14;
    case "multiple_faces_detected":
    case "background_person_detected":
      return 12;
    case "no_face_detected":
      return 8;
    case "background_speech_detected":
    case "high_noise_detected":
      return 6;
    case "looking_away":
      return 3;
    case "looking_down":
      return 2;
    case "face_distance_abnormal":
      return 1;
    case "possible_downward_attention":
      return 0;
    default:
      return 0;
  }
}

function getCodingPenaltyForOccurrence(eventType: ProctoringEventType): number {
  switch (eventType) {
    case "cell_phone_detected":
      return 16;
    case "multiple_faces_detected":
    case "background_person_detected":
      return 12;
    case "no_face_detected":
      return 8;
    case "background_speech_detected":
    case "high_noise_detected":
      return 5;
    case "looking_away":
      return 2;
    case "looking_down":
      return 1;
    case "face_distance_abnormal":
      return 0;
    case "possible_downward_attention":
      return 0;
    default:
      return 0;
  }
}

function getTechnicalPenaltyForOccurrence(eventType: ProctoringEventType): number {
  switch (eventType) {
    case "cell_phone_detected":
      return 18;
    case "multiple_faces_detected":
    case "background_person_detected":
      return 14;
    case "no_face_detected":
      return 10;
    case "background_speech_detected":
      return 6;
    case "high_noise_detected":
      return 5;
    case "looking_away":
    case "looking_down":
    case "possible_downward_attention":
    case "face_distance_abnormal":
      return 0;
    default:
      return 0;
  }
}

function getRoundCooldownMs(roundType: string): number {
  if (roundType === "aptitude") {
    return APTITUDE_EVENT_COUNT_COOLDOWN_MS;
  }

  if (roundType === "coding") {
    return CODING_EVENT_COUNT_COOLDOWN_MS;
  }

  if (roundType === "technical") {
    return TECHNICAL_EVENT_COUNT_COOLDOWN_MS;
  }

  return MCQ_EVENT_COUNT_COOLDOWN_MS;
}

export class IntegrityScorer {
  private integrityScore = 100;
  private eventCounts: EventCounts = createEmptyEventCounts();
  private lastCountedAtByEvent: Partial<Record<ProctoringEventType, number>> = {};
  private lastUpdated = Date.now();
  private activeRoundType: "mcq" | "aptitude" | "coding" | "technical" = "mcq";

  handleProctorEvent(event: ProctoringEvent): ScoringDecision {
    console.log("SCORING RECEIVED:", event);

    const normalizedRoundType = normalizeRoundType(event.roundType);
    if (
      normalizedRoundType !== "mcq" &&
      normalizedRoundType !== "aptitude" &&
      normalizedRoundType !== "coding" &&
      normalizedRoundType !== "technical"
    ) {
      return {
        counted: false,
        reason: "round_not_supported",
        newCount: 0,
        scoreDelta: 0
      };
    }

    this.activeRoundType = normalizedRoundType;

    const normalizedEventType = normalizeEventType(event.event_type);
    if (!normalizedEventType) {
      return {
        counted: false,
        reason: "unsupported_event_type",
        newCount: 0,
        scoreDelta: 0
      };
    }

    const now = event.timestamp || Date.now();
    const lastCountedAt = this.lastCountedAtByEvent[normalizedEventType] ?? 0;
    const currentCount = this.eventCounts[normalizedEventType];
    const cooldownMs = getRoundCooldownMs(normalizedRoundType);

    if (lastCountedAt > 0 && now - lastCountedAt < cooldownMs) {
      return {
        counted: false,
        reason: "cooldown_active",
        newCount: currentCount,
        scoreDelta: 0
      };
    }

    this.lastCountedAtByEvent[normalizedEventType] = now;
    this.lastUpdated = now;

    this.eventCounts[normalizedEventType] += 1;
    const newCount = this.eventCounts[normalizedEventType];
    if (normalizedRoundType === "aptitude") {
      console.log("APTITUDE EVENT:", normalizedEventType);
      console.log("DURATION:", event.duration_ms ?? 0);
      console.log("COUNT:", newCount);
    } else if (normalizedRoundType === "coding") {
      console.log("CODING EVENT:", normalizedEventType);
      console.log("DURATION:", event.duration_ms ?? 0);
      console.log("COUNT:", newCount);
    } else if (normalizedRoundType === "technical") {
      console.log("TECHNICAL EVENT:", normalizedEventType);
      console.log("DURATION:", event.duration_ms ?? 0);
      console.log("COUNT:", newCount);
    } else {
      console.log("EVENT:", normalizedEventType);
      console.log("DURATION:", event.duration_ms ?? 0);
      console.log("COUNT:", newCount);
    }

    const newDeduction =
      normalizedRoundType === "aptitude"
        ? getAptitudePenaltyForOccurrence(normalizedEventType)
        : normalizedRoundType === "coding"
          ? getCodingPenaltyForOccurrence(normalizedEventType)
          : normalizedRoundType === "technical"
            ? getTechnicalPenaltyForOccurrence(normalizedEventType)
        : getPenaltyForOccurrence(normalizedEventType, newCount);

    if (newDeduction > 0) {
      const scoreBefore = this.integrityScore;
      console.log("SCORE BEFORE:", scoreBefore);
      console.log("Penalty applied:", newDeduction);

      this.integrityScore = Math.max(0, this.integrityScore - newDeduction);
      console.log("SCORE AFTER:", this.integrityScore);

      if (this.integrityScore === 0) {
        console.log("SCORE FLOOR REACHED", { eventType: normalizedEventType, scoreBefore, attemptedPenalty: newDeduction });
      }

      return {
        counted: true,
        reason: "counted_and_scored",
        newCount,
        scoreDelta: -newDeduction
      };
    }

    return {
      counted: true,
      reason: "counted_threshold_not_reached",
      newCount,
      scoreDelta: 0
    };
  }

  processEvent(event: ProctoringEvent): void {
    this.handleProctorEvent(event);
  }

  getData(): IntegrityData {
    return {
      integrityScore: this.integrityScore,
      integrityStatus:
        this.activeRoundType === "aptitude"
          ? getAptitudeIntegrityStatus(this.integrityScore)
          : this.activeRoundType === "coding"
            ? getCodingIntegrityStatus(this.integrityScore)
            : this.activeRoundType === "technical"
              ? getTechnicalIntegrityStatus(this.integrityScore)
          : getMcqIntegrityStatus(this.integrityScore),
      eventCounts: { ...this.eventCounts },
      lastUpdated: this.lastUpdated
    };
  }

  reset(): void {
    this.integrityScore = 100;
    this.eventCounts = createEmptyEventCounts();
    this.lastCountedAtByEvent = {};
    this.lastUpdated = Date.now();
    this.activeRoundType = "mcq";
  }
}
