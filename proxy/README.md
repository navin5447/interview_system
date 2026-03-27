# Browser-Based Media Proctoring Module

Real-time client-side proctoring for interview rounds using webcam + microphone. The module performs face, gaze, phone, pose, and audio analysis in browser and emits structured events for host applications.

## Current Capabilities

- Face monitoring with MediaPipe Face Mesh
- Background person monitoring with MediaPipe Pose
- Cell phone detection with TensorFlow.js + COCO-SSD
- Audio activity/noise monitoring with Web Audio API
- Round-aware behavior for `mcq`, `aptitude`, `coding`, `technical`
- Round-aware integrity scoring with live score updates
- Structured browser event emission (`media-proctoring-event`)
- Visual debug overlay and diagnostics panel
- No media recording/storage

## Interview Rounds

Supported rounds:

- `mcq`
- `aptitude`
- `coding`
- `technical`

Each round has its own event persistence thresholds and scoring behavior.

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Hook API

```ts
useMediaProctoring(candidateId: string, sessionId: string, roundType?: RoundType)
```

Returns monitoring state, event stream, and scoring state including:

- `integrityScore`
- `integrityStatus`
- `eventCounts`
- `lastUpdated`
- `phoneDetected`, `phoneConfidence`, `phoneVisibleDurationMs`, `phoneLastDetectionAt`

## Event Types

```ts
type ProctoringEventType =
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
```

## Event Payload

```ts
{
  candidateId: string;
  sessionId: string;
  roundType: "mcq" | "aptitude" | "coding" | "technical";
  event_type: ProctoringEventType;
  severity: "low" | "medium" | "high";
  duration_ms?: number;
  timestamp: number;
}
```

## Integrity Scoring

- Score starts at `100`
- Score updates in real time from emitted proctoring events
- Scoring is round-aware
- Repeated violations are supported
- Score floor is enforced at `0`

## Phone Detection Behavior

- Full-frame detection (not face-region limited)
- Confidence threshold: `>= 0.5`
- Scan interval: `250ms`
- Sustained visibility trigger: `>= 2s`
- Repeated detection events emitted every `~2s` while phone remains visible

## Integration (Host App)

The module dispatches browser custom events named `media-proctoring-event`.

```ts
window.addEventListener("media-proctoring-event", (evt) => {
  const customEvent = evt as CustomEvent;
  console.log(customEvent.detail);
});
```

## Verification Commands

```bash
npm run lint
npm run typecheck
npm run build
```
