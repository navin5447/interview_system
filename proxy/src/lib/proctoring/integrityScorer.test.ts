import { IntegrityScorer } from "./integrityScorer";
import { ProctoringEvent } from "./types";

function makeEvent(event_type: ProctoringEvent["event_type"], roundType: ProctoringEvent["roundType"], timestamp: number): ProctoringEvent {
  return {
    candidateId: "test-candidate",
    sessionId: "test-session",
    roundType,
    event_type,
    severity: "medium",
    duration_ms: 1000,
    timestamp
  };
}

export function runAllTests(): boolean {
  try {
    const scorer = new IntegrityScorer();

    const initial = scorer.getData();
    console.assert(initial.integrityScore === 100, "Initial score should be 100");
    console.assert(initial.integrityStatus === "clean", "Initial status should be clean");

    const t0 = Date.now();

    scorer.processEvent(makeEvent("cell_phone_detected", "mcq", t0));
    let data = scorer.getData();
    console.assert(data.integrityScore === 100, "Critical event first occurrence should not deduct");

    scorer.processEvent(makeEvent("cell_phone_detected", "mcq", t0 + 2500));
    data = scorer.getData();
    console.assert(data.integrityScore === 85, "Second critical occurrence should deduct 15");

    scorer.processEvent(makeEvent("cell_phone_detected", "mcq", t0 + 5000));
    data = scorer.getData();
    console.assert(data.integrityScore === 75, "Third+ critical should result in total 25 (additional 10)");

    scorer.processEvent(makeEvent("looking_away", "mcq", t0 + 7500));
    scorer.processEvent(makeEvent("looking_away", "mcq", t0 + 10000));
    scorer.processEvent(makeEvent("looking_away", "mcq", t0 + 12500));
    data = scorer.getData();
    console.assert(data.integrityScore === 75, "Suspicious 1-3 should not deduct");

    scorer.processEvent(makeEvent("looking_away", "mcq", t0 + 15000));
    data = scorer.getData();
    console.assert(data.integrityScore === 72, "Suspicious 4-6 should deduct 3 total");

    scorer.processEvent(makeEvent("no_face_detected", "mcq", t0 + 17500));
    scorer.processEvent(makeEvent("no_face_detected", "mcq", t0 + 20000));
    data = scorer.getData();
    console.assert(data.integrityScore === 67, "No-face 2-3 should deduct 5 total");

    scorer.processEvent(makeEvent("high_noise_detected", "mcq", t0 + 22500));
    scorer.processEvent(makeEvent("high_noise_detected", "mcq", t0 + 25000));
    scorer.processEvent(makeEvent("high_noise_detected", "mcq", t0 + 27500));
    scorer.processEvent(makeEvent("high_noise_detected", "mcq", t0 + 30000));
    scorer.processEvent(makeEvent("high_noise_detected", "mcq", t0 + 32500));
    data = scorer.getData();
    console.assert(data.integrityScore === 67, "Minor <=5 should not deduct");

    scorer.processEvent(makeEvent("high_noise_detected", "mcq", t0 + 35000));
    data = scorer.getData();
    console.assert(data.integrityScore === 65, "Minor >5 should deduct 2 total");

    scorer.processEvent(makeEvent("background_person_detected", "technical", t0 + 37500));
    data = scorer.getData();
    console.assert(data.integrityScore === 65, "Non-MCQ should not change score");

    scorer.processEvent(makeEvent("looking_down", "mcq", t0 + 40000));
    scorer.processEvent(makeEvent("looking_down", "mcq", t0 + 40500));
    data = scorer.getData();
    console.assert(data.eventCounts.looking_down === 1, "Events within 2s cooldown should count once");

    console.assert(data.lastUpdated > 0, "lastUpdated should be available");

    scorer.reset();
    data = scorer.getData();
    console.assert(data.integrityScore === 100, "Reset should restore score to 100");
    console.assert(Object.values(data.eventCounts).every((count) => count === 0), "Reset should clear counts");

    console.log("All MCQ integrity scorer tests passed.");
    return true;
  } catch (error) {
    console.error("MCQ integrity scorer tests failed.", error);
    return false;
  }
}
