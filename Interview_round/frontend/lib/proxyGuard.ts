export type ProxyViolationType =
  | "tab_hidden"
  | "window_blur"
  | "fullscreen_exit"
  | "phone_detected"
  | "multiple_faces"
  | "no_face";

export interface ProxyViolation {
  type: ProxyViolationType;
  penalty: number;
  timestamp: number;
}

export interface ProxyGuardState {
  score: number;
  violations: ProxyViolation[];
}

export const DEFAULT_PROXY_SCORE = 100;

type ProxyRoundType = "mcq" | "aptitude" | "coding" | "technical";

const ROUND_PENALTIES: Record<ProxyRoundType, Record<ProxyViolationType, number>> = {
  mcq: { tab_hidden: 12, window_blur: 8, fullscreen_exit: 15, phone_detected: 25, multiple_faces: 20, no_face: 10 },
  aptitude: { tab_hidden: 8, window_blur: 6, fullscreen_exit: 10, phone_detected: 20, multiple_faces: 15, no_face: 8 },
  coding: { tab_hidden: 10, window_blur: 6, fullscreen_exit: 12, phone_detected: 22, multiple_faces: 18, no_face: 8 },
  technical: { tab_hidden: 12, window_blur: 8, fullscreen_exit: 15, phone_detected: 25, multiple_faces: 20, no_face: 10 },
};

export function getProxyPenalty(roundType: string | undefined, violationType: ProxyViolationType): number {
  const normalized = (roundType || "technical").toLowerCase() as ProxyRoundType;
  const byRound = ROUND_PENALTIES[normalized] ?? ROUND_PENALTIES.technical;
  return byRound[violationType];
}

export function applyProxyViolation(state: ProxyGuardState, type: ProxyViolationType, roundType?: string): ProxyGuardState {
  const penalty = getProxyPenalty(roundType, type);
  const nextScore = Math.max(0, state.score - penalty);
  return {
    score: nextScore,
    violations: [...state.violations, { type, penalty, timestamp: Date.now() }],
  };
}

export function isFullscreenActive(): boolean {
  return Boolean((document as any).fullscreenElement || (document as any).webkitFullscreenElement || (document as any).msFullscreenElement);
}

export async function requestFullscreenSafe(): Promise<boolean> {
  try {
    if (!isFullscreenActive()) {
      const docEl: any = document.documentElement;
      const requestFn = docEl.requestFullscreen || docEl.webkitRequestFullscreen || docEl.msRequestFullscreen;
      if (!requestFn) return false;
      await requestFn.call(docEl);
    }
    return true;
  } catch {
    return false;
  }
}

export async function requestMediaPermission(): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return true;
  } catch {
    return false;
  }
}
