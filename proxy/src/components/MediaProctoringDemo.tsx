"use client";

import { useState } from "react";
import { useMediaProctoring } from "@/hooks/useMediaProctoring";
import { RoundType } from "@/lib/proctoring/roundPolicies";

const CANDIDATE_ID = "candidate-demo-001";
const SESSION_ID = "session-demo-001";

function statusColor(statusText: string): string {
  if (statusText === "Face OK") {
    return "#30f18d";
  }

  if (statusText === "No Face") {
    return "#ff6b6b";
  }

  return "#ffb347";
}

export function MediaProctoringDemo() {
  const [roundType, setRoundType] = useState<RoundType>("technical");

  const {
    videoRef,
    canvasRef,
    isMonitoring,
    permission,
    roundType: activeRoundType,
    statusText,
    faceStatus,
    gazeDirection,
    personCount,
    backgroundPersonDetected,
    eyeOpennessPercent,
    downwardAttentionStatus,
    phoneDetected,
    phoneConfidence,
    phoneVisibleDurationMs,
    phoneLastDetectionAt,
    phoneDetectionIntervalMs,
    audioLevel,
    audioStatus,
    speechActive,
    activeViolations,
    events,
    error,
    integrityScore,
    integrityStatus,
    eventCounts,
    lastUpdated
  } =
    useMediaProctoring(CANDIDATE_ID, SESSION_ID, roundType);

  return (
    <main
      style={{
        maxWidth: 980,
        margin: "0 auto",
        padding: "24px 16px 40px",
        display: "grid",
        gap: 16
      }}
    >
      <h1 style={{ margin: 0, fontSize: 28 }}>Video & Audio Proctoring Module</h1>
      <p style={{ margin: 0, opacity: 0.8 }}>
        Real-time browser monitoring for face presence, attention, and background audio. No media is recorded or stored.
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <strong>Round Type</strong>
        <select
          value={roundType}
          onChange={(event) => setRoundType(event.target.value as RoundType)}
          style={{
            background: "#0b1224",
            color: "#f5f7ff",
            border: "1px solid rgba(255,255,255,0.2)",
            borderRadius: 6,
            padding: "4px 8px"
          }}
        >
          <option value="mcq">mcq</option>
          <option value="aptitude">aptitude</option>
          <option value="coding">coding</option>
          <option value="technical">technical</option>
        </select>
      </div>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 300px",
          gap: 16,
          alignItems: "start"
        }}
      >
        <div
          style={{
            position: "relative",
            borderRadius: 12,
            overflow: "hidden",
            border: "1px solid rgba(255,255,255,0.12)",
            background: "#030712"
          }}
        >
          <video ref={videoRef} playsInline autoPlay muted style={{ width: "100%", display: "block" }} />
          <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />

          <div
            style={{
              position: "absolute",
              left: 12,
              top: 12,
              padding: "6px 10px",
              borderRadius: 999,
              fontWeight: 600,
              fontSize: 13,
              color: "#0a0a0a",
              background: statusColor(statusText)
            }}
          >
            {statusText}
          </div>
        </div>

        <aside
          style={{
            display: "grid",
            gap: 12,
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 12,
            padding: 12,
            background: "rgba(2,6,23,0.8)"
          }}
        >
          <div>
            <strong>Permission:</strong> {permission}
          </div>
          <div>
            <strong>Monitoring:</strong> {isMonitoring ? "Active" : "Stopped"}
          </div>
          <div>
            <strong>Active Round:</strong> {activeRoundType}
          </div>
          <div>
            <strong>Face Status:</strong> {faceStatus}
          </div>
          <div>
            <strong>Speech Activity:</strong> {speechActive ? "Detected" : "Not detected"}
          </div>
          <div>
            <strong>Audio Status:</strong> {audioStatus}
          </div>
          <div>
            <strong>Gaze:</strong> {gazeDirection.toUpperCase()}
          </div>
          <div>
            <strong>Eye Openness:</strong> {Math.round(eyeOpennessPercent)}%
          </div>
          <div>
            <strong>Downward Attention:</strong> {downwardAttentionStatus.toUpperCase()}
          </div>
          <div>
            <strong>Phone Detection:</strong> {phoneDetected ? "DETECTED" : "Clear"}
          </div>
          <div>
            <strong>Phone Confidence:</strong> {phoneDetected ? `${Math.round(phoneConfidence * 100)}%` : "-"}
          </div>
          <div>
            <strong>Phone Visible Duration:</strong> {phoneVisibleDurationMs} ms
          </div>
          <div>
            <strong>Phone Last Detection:</strong> {phoneLastDetectionAt ? new Date(phoneLastDetectionAt).toLocaleTimeString() : "-"}
          </div>
          <div>
            <strong>Phone Scan Interval:</strong> {phoneDetectionIntervalMs} ms
          </div>
          <div>
            <strong>Person Count:</strong> {personCount}
          </div>
          <div>
            <strong>Background Presence:</strong> {backgroundPersonDetected ? "Detected" : "Clear"}
          </div>
          <div style={{ display: "grid", gap: 4 }}>
            <strong>Active Violations:</strong>
            {activeViolations.length === 0 ? (
              <span style={{ opacity: 0.7 }}>none</span>
            ) : (
              <span>{activeViolations.join(", ")}</span>
            )}
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <strong>Audio Level</strong>
            <div
              style={{
                width: "100%",
                height: 12,
                borderRadius: 999,
                overflow: "hidden",
                background: "rgba(255,255,255,0.15)"
              }}
            >
              <div
                style={{
                  width: `${Math.round(audioLevel * 100)}%`,
                  height: "100%",
                  background: audioLevel > 0.7 ? "#ff6b6b" : "#30f18d",
                  transition: "width 80ms linear"
                }}
              />
            </div>
          </div>

          {error ? <div style={{ color: "#ff6b6b", fontSize: 13 }}>Error: {error}</div> : null}
        </aside>
      </section>

      <section
        style={{
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 12,
          padding: 12,
          background: "rgba(2,6,23,0.8)"
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: 10, fontSize: 18 }}>Integrity Score</h2>
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gap: 6 }}>
            <div>
              <strong>Score:</strong> {Math.round(integrityScore * 100) / 100} / 100
            </div>
            <div
              style={{
                width: "100%",
                height: 20,
                borderRadius: 999,
                overflow: "hidden",
                background: "rgba(255,255,255,0.15)"
              }}
            >
              <div
                style={{
                  width: `${Math.min(100, integrityScore)}%`,
                  height: "100%",
                  background:
                    integrityScore >= 85
                      ? "#30f18d"
                      : integrityScore >= 70
                        ? "#ffd700"
                        : integrityScore >= 50
                          ? "#ff9500"
                          : "#ff6b6b",
                  transition: "width 200ms ease-out"
                }}
              />
            </div>
          </div>
          <div>
            <strong>Status:</strong>{" "}
            <span
              style={{
                padding: "2px 6px",
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 600,
                background:
                  integrityStatus === "clean"
                    ? "rgba(48, 241, 141, 0.2)"
                    : integrityStatus === "slightly_suspicious"
                      ? "rgba(255, 215, 0, 0.2)"
                      : integrityStatus === "review_required"
                        ? "rgba(255, 149, 0, 0.2)"
                        : "rgba(255, 107, 107, 0.2)",
                color:
                  integrityStatus === "clean"
                    ? "#30f18d"
                    : integrityStatus === "slightly_suspicious"
                      ? "#ffd700"
                      : integrityStatus === "review_required"
                        ? "#ff9500"
                        : "#ff6b6b"
              }}
            >
              {integrityStatus.replace(/_/g, " ").toUpperCase()}
            </span>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <strong>Event Counts</strong>
            <div style={{ display: "grid", gap: 6, maxHeight: 200, overflow: "auto", fontSize: 12 }}>
              {Object.entries(eventCounts)
                .filter(([, count]) => count > 0)
                .map(([eventType, count]) => (
                  <div
                    key={eventType}
                    style={{
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: 6,
                      padding: 8,
                      background: "rgba(0,0,0,0.3)",
                      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
                    }}
                  >
                    <div><strong>{eventType}</strong></div>
                    <div>count: {count}</div>
                  </div>
                ))}
              {Object.values(eventCounts).every((count) => count === 0) ? (
                <div style={{ opacity: 0.7 }}>No counted events yet.</div>
              ) : null}
            </div>
          </div>
          <div>
            <strong>Last Updated:</strong> {new Date(lastUpdated).toLocaleTimeString()}
          </div>
        </div>
      </section>

      <section
        style={{
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 12,
          padding: 12,
          background: "rgba(2,6,23,0.8)"
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: 10, fontSize: 18 }}>Suspicious Event Stream</h2>

        <div style={{ display: "grid", gap: 8, maxHeight: 260, overflow: "auto" }}>
          {events.length === 0 ? (
            <div style={{ opacity: 0.7 }}>No suspicious events emitted yet.</div>
          ) : (
            events.map((event) => (
              <div
                key={`${event.timestamp}-${event.event_type}`}
                style={{
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 8,
                  padding: 10,
                  fontSize: 13,
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
                }}
              >
                <div>event_type: {event.event_type}</div>
                <div>roundType: {event.roundType}</div>
                <div>severity: {event.severity}</div>
                <div>timestamp: {new Date(event.timestamp).toLocaleTimeString()}</div>
                <div>duration_ms: {event.duration_ms ?? "-"}</div>
                <div>candidateId: {event.candidateId}</div>
                <div>sessionId: {event.sessionId}</div>
              </div>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
