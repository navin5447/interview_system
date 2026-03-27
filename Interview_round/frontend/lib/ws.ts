export type InterviewEvent =
  | "interview:question_start"
  | "interview:transcript_update"
  | "interview:emotion_update"
  | "interview:evaluation_done"
  | "interview:session_end";

function getWsBase() {
  if (process.env.NEXT_PUBLIC_API_BASE) {
    return process.env.NEXT_PUBLIC_API_BASE.replace("http://", "ws://").replace("https://", "wss://");
  }

  if (typeof window !== "undefined") {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.hostname}:8000`;
  }

  return "ws://127.0.0.1:8000";
}

export function createInterviewSocket(sessionId: string, onEvent: (event: InterviewEvent, data: any) => void) {
  const wsBase = getWsBase();
  const ws = new WebSocket(`${wsBase}/api/ws/interview/${sessionId}`);

  ws.onmessage = (msg) => {
    try {
      const parsed = JSON.parse(msg.data);
      onEvent(parsed.event as InterviewEvent, parsed.data);
    } catch {
      // no-op for malformed events
    }
  };

  return ws;
}
