import { ProctoringEvent, ProctoringEventType } from "./types";
import { ProctoringSeverity, RoundType } from "./roundPolicies";

const EVENT_NAME = "media-proctoring-event";

export const MEDIA_PROCTORING_EVENT_NAME = EVENT_NAME;

export function buildProctoringEvent(params: {
  candidateId: string;
  sessionId: string;
  roundType: RoundType;
  eventType: ProctoringEventType;
  severity: ProctoringSeverity;
  durationMs?: number;
}): ProctoringEvent {
  return {
    candidateId: params.candidateId,
    sessionId: params.sessionId,
    roundType: params.roundType,
    event_type: params.eventType,
    severity: params.severity,
    duration_ms: params.durationMs,
    timestamp: Date.now()
  };
}

export function emitProctoringEvent(event: ProctoringEvent): void {
  // Dispatches a browser event so hosting applications can forward events to APIs.
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<ProctoringEvent>(EVENT_NAME, { detail: event }));
  }

  console.log("EMITTED:", event);

  // Helpful local visibility for development and integration.
  console.debug("[proctoring-event]", event);
}
