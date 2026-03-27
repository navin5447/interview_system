"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FaceMesh, Results } from "@mediapipe/face_mesh";
import { Pose, Results as PoseResults } from "@mediapipe/pose";
import { AudioAnalyzer } from "@/lib/proctoring/audioAnalyzer";
import { buildProctoringEvent, emitProctoringEvent } from "@/lib/proctoring/eventEmitter";
import { drawFaceLandmarks, evaluateFaceResults } from "@/lib/proctoring/faceAnalyzer";
import { drawPhoneDetections, PhoneDetection, PhoneDetector, PHONE_DETECTION_INTERVAL_MS } from "@/lib/proctoring/phoneDetector";
import { drawPoseSkeleton, evaluatePosePresence, MinimalPoseResults, NormalizedBounds } from "@/lib/proctoring/poseAnalyzer";
import { getRoundPolicy, RoundType } from "@/lib/proctoring/roundPolicies";
import { IntegrityScorer, IntegrityData } from "@/lib/proctoring/integrityScorer";
import {
  AudioMetrics,
  FaceStatus,
  GazeDirection,
  PermissionState,
  ProctoringEvent,
  ProctoringEventType
} from "@/lib/proctoring/types";

const EVENT_COOLDOWN_MS = 2000;
const GAZE_WINDOW_SIZE = 10;
const BLINK_IGNORE_MS = 400;
const PHONE_MIN_VISIBLE_MS = 2000;
const PHONE_VISIBILITY_GRACE_MS = 500;

type AudioStatus = "calibrating" | "quiet" | "speaking" | "noisy" | "loud";
type DownwardAttentionStatus = "clear" | "watch" | "likely";

const FACE_STATUS_LABELS: Record<FaceStatus, string> = {
  face_ok: "Face OK",
  no_face: "No Face",
  multiple_faces: "Multiple Faces",
  looking_away: "Looking Away",
  face_distance_abnormal: "Face Too Far"
};

function classifyGaze(horizontal: number, vertical: number): GazeDirection {
  if (horizontal < 0.35) {
    return "left";
  }

  if (horizontal > 0.65) {
    return "right";
  }

  if (vertical > 0.65) {
    return "down";
  }

  if (vertical < 0.35) {
    return "up";
  }

  return "forward";
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) {
    return 0;
  }

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export interface UseMediaProctoringResult {
  videoRef: React.RefObject<HTMLVideoElement>;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  isMonitoring: boolean;
  permission: PermissionState;
  roundType: RoundType;
  faceStatus: FaceStatus;
  statusText: string;
  gazeDirection: GazeDirection;
  personCount: number;
  backgroundPersonDetected: boolean;
  eyeOpennessPercent: number;
  downwardAttentionStatus: DownwardAttentionStatus;
  phoneDetected: boolean;
  phoneConfidence: number;
  phoneVisibleDurationMs: number;
  phoneLastDetectionAt: number | null;
  phoneDetectionIntervalMs: number;
  audioLevel: number;
  audioStatus: AudioStatus;
  speechActive: boolean;
  activeViolations: ProctoringEventType[];
  events: ProctoringEvent[];
  error: string | null;
  integrityScore: number;
  integrityStatus: string;
  eventCounts: IntegrityData["eventCounts"];
  lastUpdated: number;
}

export function useMediaProctoring(
  candidateId: string,
  sessionId: string,
  roundType: RoundType = "technical"
): UseMediaProctoringResult {
  const policy = useMemo(() => getRoundPolicy(roundType), [roundType]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const faceMeshRef = useRef<FaceMesh | null>(null);
  const poseRef = useRef<Pose | null>(null);
  const phoneDetectorRef = useRef<PhoneDetector | null>(null);
  const audioAnalyzerRef = useRef<AudioAnalyzer | null>(null);

  const frameRequestRef = useRef<number | null>(null);
  const frameInFlightRef = useRef(false);
  const poseInFlightRef = useRef(false);
  const phoneInFlightRef = useRef(false);
  const poseFrameCounterRef = useRef(0);
  const phoneLastDetectionAtRef = useRef(0);
  const startupTokenRef = useRef(0);
  const isStartingRef = useRef(false);

  const faceStatusRef = useRef<FaceStatus>("no_face");
  const lookingDownActiveRef = useRef(false);
  const backgroundPersonActiveRef = useRef(false);
  const possibleDownwardAttentionActiveRef = useRef(false);
  const phoneDetectedActiveRef = useRef(false);
  const latestPhoneDetectionsRef = useRef<PhoneDetection[]>([]);
  const phoneVisibleStartRef = useRef<number | null>(null);
  const phoneLastSeenAtRef = useRef<number | null>(null);
  const reducedEyeStartRef = useRef<number | null>(null);
  const faceWidthBaselineRef = useRef<number | null>(null);
  const speechViolationActiveRef = useRef(false);
  const highNoiseActiveRef = useRef(false);

  const poseDetectionWindowRef = useRef<number[]>([]);
  const latestPoseResultsRef = useRef<MinimalPoseResults | null>(null);
  const faceBoundsRef = useRef<NormalizedBounds | null>(null);

  const gazeHorizontalWindowRef = useRef<number[]>([]);
  const gazeVerticalWindowRef = useRef<number[]>([]);
  const headPitchWindowRef = useRef<number[]>([]);

  const audioCalibrationStartRef = useRef<number | null>(null);
  const audioCalibrationSamplesRef = useRef<number[]>([]);
  const audioBaselineReadyRef = useRef(false);
  const audioBaselineRef = useRef(0.02);
  const previousAudioLevelRef = useRef(0);
  const speechStartRef = useRef<number | null>(null);
  const noiseStartRef = useRef<number | null>(null);
  const loudStartRef = useRef<number | null>(null);
  const loudSpikeTimesRef = useRef<number[]>([]);

  const audioMetricsRef = useRef<AudioMetrics>({
    level: 0,
    speechActive: false,
    continuousSound: false,
    suddenLoudNoise: false
  });

  const activeStartsRef = useRef<Partial<Record<ProctoringEventType, number>>>({});
  const lastEmitRef = useRef<Partial<Record<ProctoringEventType, number>>>({});
  const activeViolationSetRef = useRef<Set<ProctoringEventType>>(new Set());

  // Initialize integrity scorer
  const integrityscorerRef = useRef<IntegrityScorer>(new IntegrityScorer());

  const [permission, setPermission] = useState<PermissionState>("idle");
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [faceStatus, setFaceStatus] = useState<FaceStatus>("no_face");
  const [gazeDirection, setGazeDirection] = useState<GazeDirection>("unknown");
  const [personCount, setPersonCount] = useState(0);
  const [backgroundPersonDetected, setBackgroundPersonDetected] = useState(false);
  const [eyeOpennessPercent, setEyeOpennessPercent] = useState(100);
  const [downwardAttentionStatus, setDownwardAttentionStatus] = useState<DownwardAttentionStatus>("clear");
  const [phoneDetected, setPhoneDetected] = useState(false);
  const [phoneConfidence, setPhoneConfidence] = useState(0);
  const [phoneVisibleDurationMs, setPhoneVisibleDurationMs] = useState(0);
  const [phoneLastDetectionAt, setPhoneLastDetectionAt] = useState<number | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [audioStatus, setAudioStatus] = useState<AudioStatus>("calibrating");
  const [speechActive, setSpeechActive] = useState(false);
  const [integrityScore, setIntegrityScore] = useState(100);
  const [integrityStatus, setIntegrityStatus] = useState<string>("clean");
  const [eventCounts, setEventCounts] = useState<IntegrityData["eventCounts"]>(
    integrityscorerRef.current.getData().eventCounts
  );
  const [lastUpdated, setLastUpdated] = useState<number>(integrityscorerRef.current.getData().lastUpdated);
  const [activeViolations, setActiveViolations] = useState<ProctoringEventType[]>([]);
  const [events, setEvents] = useState<ProctoringEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  const setViolationActive = useCallback((eventType: ProctoringEventType, isActive: boolean) => {
    const set = activeViolationSetRef.current;
    const had = set.has(eventType);

    if (isActive && !had) {
      set.add(eventType);
      setActiveViolations(Array.from(set));
      return;
    }

    if (!isActive && had) {
      set.delete(eventType);
      setActiveViolations(Array.from(set));
    }
  }, []);

  const handleProctorEvent = useCallback((event: ProctoringEvent) => {
    const decision = integrityscorerRef.current.handleProctorEvent(event);
    const integrityData = integrityscorerRef.current.getData();

    setIntegrityScore(() => integrityData.integrityScore);
    setIntegrityStatus(() => integrityData.integrityStatus);
    setEventCounts(() => integrityData.eventCounts);
    setLastUpdated(() => integrityData.lastUpdated);

    console.log("SCORING DECISION:", decision);
    return decision;
  }, []);

  const pushEvent = useCallback(
    (eventType: ProctoringEventType, durationMs?: number) => {
      const rule = policy.events[eventType];
      const event = buildProctoringEvent({
        candidateId,
        sessionId,
        roundType,
        eventType,
        severity: rule.severity,
        durationMs
      });

      emitProctoringEvent(event);
      handleProctorEvent(event);
      setEvents((previous) => [event, ...previous].slice(0, 100));
    },
    [candidateId, handleProctorEvent, policy.events, roundType, sessionId]
  );

  const processCondition = useCallback(
    (eventType: ProctoringEventType, isActive: boolean) => {
      const rule = policy.events[eventType];
      const activeStarts = activeStartsRef.current;
      const lastEmit = lastEmitRef.current;

      if (!rule.enabled || !isActive) {
        delete activeStarts[eventType];
        setViolationActive(eventType, false);
        return;
      }

      const now = Date.now();
      if (!activeStarts[eventType]) {
        activeStarts[eventType] = now;
      }

      const activeForMs = now - (activeStarts[eventType] ?? now);
      const isPersistent = activeForMs >= rule.minDurationMs;
      setViolationActive(eventType, isPersistent);

      if (!isPersistent) {
        return;
      }

      console.log("DETECTED:", {
        event_type: eventType,
        roundType,
        duration_ms: activeForMs,
        minDurationMs: rule.minDurationMs
      });

      if (lastEmit[eventType] && now - (lastEmit[eventType] ?? 0) < EVENT_COOLDOWN_MS) {
        return;
      }

      lastEmit[eventType] = now;
      pushEvent(eventType, activeForMs);
    },
    [policy.events, pushEvent, roundType, setViolationActive]
  );

  const evaluateConditions = useCallback(() => {
    processCondition("no_face_detected", faceStatusRef.current === "no_face");
    processCondition("multiple_faces_detected", faceStatusRef.current === "multiple_faces");
    processCondition("looking_away", faceStatusRef.current === "looking_away");
    processCondition("looking_down", lookingDownActiveRef.current);
    processCondition("possible_downward_attention", possibleDownwardAttentionActiveRef.current);
    processCondition("cell_phone_detected", phoneDetectedActiveRef.current);
    processCondition("background_person_detected", backgroundPersonActiveRef.current);
    processCondition("face_distance_abnormal", faceStatusRef.current === "face_distance_abnormal");
    processCondition("background_speech_detected", speechViolationActiveRef.current);
    processCondition("high_noise_detected", highNoiseActiveRef.current);
  }, [processCondition]);

  const resetAudioState = useCallback(() => {
    audioCalibrationStartRef.current = null;
    audioCalibrationSamplesRef.current = [];
    audioBaselineReadyRef.current = false;
    audioBaselineRef.current = 0.02;
    previousAudioLevelRef.current = 0;
    speechStartRef.current = null;
    noiseStartRef.current = null;
    loudStartRef.current = null;
    loudSpikeTimesRef.current = [];
    speechViolationActiveRef.current = false;
    highNoiseActiveRef.current = false;
    setAudioStatus("calibrating");
  }, []);

  const stopMonitoring = useCallback(() => {
    startupTokenRef.current += 1;
    isStartingRef.current = false;

    if (frameRequestRef.current !== null) {
      cancelAnimationFrame(frameRequestRef.current);
      frameRequestRef.current = null;
    }

    frameInFlightRef.current = false;
    poseInFlightRef.current = false;
    phoneInFlightRef.current = false;
    poseFrameCounterRef.current = 0;
    phoneLastDetectionAtRef.current = 0;

    lookingDownActiveRef.current = false;
    backgroundPersonActiveRef.current = false;
    possibleDownwardAttentionActiveRef.current = false;
    phoneDetectedActiveRef.current = false;
    latestPhoneDetectionsRef.current = [];
    phoneVisibleStartRef.current = null;
    phoneLastSeenAtRef.current = null;
    reducedEyeStartRef.current = null;
    faceWidthBaselineRef.current = null;
    poseDetectionWindowRef.current = [];
    latestPoseResultsRef.current = null;
    faceBoundsRef.current = null;

    gazeHorizontalWindowRef.current = [];
    gazeVerticalWindowRef.current = [];
    headPitchWindowRef.current = [];

    activeStartsRef.current = {};
    activeViolationSetRef.current = new Set();
    setActiveViolations([]);

    // Reset integrity scorer for new session
    integrityscorerRef.current.reset();
    const resetIntegrityData = integrityscorerRef.current.getData();
    setIntegrityScore(resetIntegrityData.integrityScore);
    setIntegrityStatus(resetIntegrityData.integrityStatus);
    setEventCounts(resetIntegrityData.eventCounts);
    setLastUpdated(resetIntegrityData.lastUpdated);

    resetAudioState();

    setGazeDirection("unknown");
    setPersonCount(0);
    setBackgroundPersonDetected(false);
    setEyeOpennessPercent(100);
    setDownwardAttentionStatus("clear");
    setPhoneDetected(false);
    setPhoneConfidence(0);
    setPhoneVisibleDurationMs(0);
    setPhoneLastDetectionAt(null);

    if (audioAnalyzerRef.current) {
      audioAnalyzerRef.current.stop();
      audioAnalyzerRef.current = null;
    }

    if (faceMeshRef.current) {
      faceMeshRef.current.close();
      faceMeshRef.current = null;
    }

    if (poseRef.current) {
      poseRef.current.close();
      poseRef.current = null;
    }

    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }

    if (audioStreamRef.current) {
      for (const track of audioStreamRef.current.getTracks()) {
        track.stop();
      }
      audioStreamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    const canvas = canvasRef.current;
    if (canvas) {
      const context = canvas.getContext("2d");
      context?.clearRect(0, 0, canvas.width, canvas.height);
    }

    setIsMonitoring(false);
  }, [resetAudioState]);

  const startMonitoring = useCallback(async () => {
    if (isStartingRef.current) {
      return;
    }

    const startupToken = startupTokenRef.current + 1;
    startupTokenRef.current = startupToken;
    isStartingRef.current = true;

    const isStale = () => startupTokenRef.current !== startupToken;

    setPermission("requesting");
    setError(null);

    try {
      const videoStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user"
        }
      });

      if (isStale()) {
        for (const track of videoStream.getTracks()) {
          track.stop();
        }
        return;
      }

      streamRef.current = videoStream;
      setPermission("granted");

      const video = videoRef.current;
      if (!video) {
        throw new Error("Video element is not ready");
      }

      video.srcObject = videoStream;
      video.muted = true;

      try {
        await video.play();
      } catch (playError) {
        const message = playError instanceof Error ? playError.message : String(playError);
        const isInterrupted = /interrupted by a new load request/i.test(message);
        if (!isStale() && !isInterrupted) {
          throw playError;
        }
      }

      if (isStale()) {
        return;
      }

      setIsMonitoring(true);

      try {
        const faceMesh = new FaceMesh({
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
        });

        const pose = new Pose({
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
        });

        faceMesh.setOptions({
          maxNumFaces: 2,
          refineLandmarks: true,
          minDetectionConfidence: 0.6,
          minTrackingConfidence: 0.6
        });

        pose.setOptions({
          modelComplexity: 1,
          smoothLandmarks: true,
          enableSegmentation: false,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5
        });

        pose.onResults((results: PoseResults) => {
          latestPoseResultsRef.current = results;

          const poseEval = evaluatePosePresence(results, faceBoundsRef.current);
          setPersonCount(poseEval.personCount);

          const detectionWindow = poseDetectionWindowRef.current;
          detectionWindow.push(poseEval.backgroundPersonDetected ? 1 : 0);
          if (detectionWindow.length > 15) {
            detectionWindow.shift();
          }

          const averageDetection = detectionWindow.reduce((sum, value) => sum + value, 0) / detectionWindow.length;
          const smoothedBackgroundDetected = averageDetection >= 0.6;

          backgroundPersonActiveRef.current = smoothedBackgroundDetected;
          setBackgroundPersonDetected(smoothedBackgroundDetected);
        });

        faceMesh.onResults((results: Results) => {
          const analysis = evaluateFaceResults(results);
          faceStatusRef.current = analysis.status;
          setFaceStatus(analysis.status);

          const firstFace = results.multiFaceLandmarks?.[0] ?? [];
          if (firstFace.length > 0) {
            let minX = 1;
            let minY = 1;
            let maxX = 0;
            let maxY = 0;

            for (const point of firstFace) {
              minX = Math.min(minX, point.x);
              minY = Math.min(minY, point.y);
              maxX = Math.max(maxX, point.x);
              maxY = Math.max(maxY, point.y);
            }

            faceBoundsRef.current = { minX, minY, maxX, maxY };
          } else {
            faceBoundsRef.current = null;
          }

          const validRatios =
            analysis.irisHorizontalRatio !== null &&
            analysis.irisVerticalRatio !== null &&
            analysis.status !== "no_face" &&
            analysis.status !== "multiple_faces" &&
            !analysis.eyesClosed;

          const now = Date.now();
          const facePresent = analysis.status !== "no_face" && analysis.status !== "multiple_faces";
          const reducedEyeOpen = analysis.reducedEyeOpenness && !analysis.eyesClosed && facePresent;

          if (reducedEyeOpen) {
            reducedEyeStartRef.current = reducedEyeStartRef.current ?? now;
          } else {
            reducedEyeStartRef.current = null;
          }

          if (analysis.faceWidthRatio > 0) {
            if (faceWidthBaselineRef.current === null) {
              faceWidthBaselineRef.current = analysis.faceWidthRatio;
            } else if (!reducedEyeOpen) {
              faceWidthBaselineRef.current = faceWidthBaselineRef.current * 0.98 + analysis.faceWidthRatio * 0.02;
            }
          }

          const reducedEyeDuration = reducedEyeStartRef.current ? now - reducedEyeStartRef.current : 0;
          const blinkLike = reducedEyeOpen && reducedEyeDuration < BLINK_IGNORE_MS;
          const faceCloser =
            faceWidthBaselineRef.current !== null && analysis.faceWidthRatio > faceWidthBaselineRef.current * 1.08;

          setEyeOpennessPercent(Math.max(0, Math.min(100, analysis.eyeOpennessPercent)));

          if (validRatios) {
            const irisHorizontal = analysis.irisHorizontalRatio as number;
            const irisVertical = analysis.irisVerticalRatio as number;
            const horizontalWindow = gazeHorizontalWindowRef.current;
            const verticalWindow = gazeVerticalWindowRef.current;
            const pitchWindow = headPitchWindowRef.current;

            horizontalWindow.push(irisHorizontal);
            verticalWindow.push(irisVertical);
            pitchWindow.push(analysis.headPitchDown ? 1 : 0);

            if (horizontalWindow.length > GAZE_WINDOW_SIZE) {
              horizontalWindow.shift();
            }

            if (verticalWindow.length > GAZE_WINDOW_SIZE) {
              verticalWindow.shift();
            }

            if (pitchWindow.length > GAZE_WINDOW_SIZE) {
              pitchWindow.shift();
            }

            const avgHorizontal = horizontalWindow.reduce((sum, value) => sum + value, 0) / horizontalWindow.length;
            const avgVertical = verticalWindow.reduce((sum, value) => sum + value, 0) / verticalWindow.length;
            const avgHeadPitchDown = pitchWindow.reduce((sum, value) => sum + value, 0) / pitchWindow.length;

            const smoothedGaze = classifyGaze(avgHorizontal, avgVertical);
            setGazeDirection(smoothedGaze);

            const downByIris = smoothedGaze === "down";
            const downByHeadPitch = avgHeadPitchDown >= 0.6;
            lookingDownActiveRef.current = downByIris || downByHeadPitch;
            const gazeUnstable =
              standardDeviation(horizontalWindow) > 0.08 || standardDeviation(verticalWindow) > 0.08;

            const baseCondition = reducedEyeOpen && !blinkLike;
            let confidenceScore = baseCondition ? 1 : 0;
            if (analysis.headPitchDown) {
              confidenceScore += 1;
            }
            if (faceCloser) {
              confidenceScore += 1;
            }
            if (gazeUnstable) {
              confidenceScore += 1;
            }

            possibleDownwardAttentionActiveRef.current = baseCondition;

            if (!baseCondition) {
              setDownwardAttentionStatus("clear");
            } else if (confidenceScore >= 2) {
              setDownwardAttentionStatus("likely");
            } else {
              setDownwardAttentionStatus("watch");
            }
          } else {
            setGazeDirection("forward");
            lookingDownActiveRef.current = false;

            const baseCondition = reducedEyeOpen && !blinkLike;
            let confidenceScore = baseCondition ? 1 : 0;
            if (analysis.headPitchDown) {
              confidenceScore += 1;
            }
            if (faceCloser) {
              confidenceScore += 1;
            }

            possibleDownwardAttentionActiveRef.current = baseCondition;
            if (!baseCondition) {
              setDownwardAttentionStatus("clear");
            } else if (confidenceScore >= 2) {
              setDownwardAttentionStatus("likely");
            } else {
              setDownwardAttentionStatus("watch");
            }
          }

          const canvas = canvasRef.current;
          const currentVideo = videoRef.current;

          if (canvas && currentVideo && currentVideo.videoWidth > 0 && currentVideo.videoHeight > 0) {
            if (canvas.width !== currentVideo.videoWidth || canvas.height !== currentVideo.videoHeight) {
              canvas.width = currentVideo.videoWidth;
              canvas.height = currentVideo.videoHeight;
            }

            drawFaceLandmarks(canvas, results, analysis.status, true);

            const latestPose = latestPoseResultsRef.current;
            if (latestPose) {
              drawPoseSkeleton(canvas, latestPose);
            }

            const phoneDetections = latestPhoneDetectionsRef.current;
            if (phoneDetections.length > 0) {
              drawPhoneDetections(canvas, phoneDetections);
            }
          }

          evaluateConditions();
        });

        faceMeshRef.current = faceMesh;
        poseRef.current = pose;

        const phoneDetector = new PhoneDetector();
        phoneDetectorRef.current = phoneDetector;
        void phoneDetector.init();

        const processFrames = async (): Promise<void> => {
          const currentVideo = videoRef.current;
          const activeFaceMesh = faceMeshRef.current;
          const activePose = poseRef.current;

          if (!currentVideo || !activeFaceMesh || !streamRef.current) {
            return;
          }

          if (currentVideo.readyState >= 2 && !frameInFlightRef.current) {
            frameInFlightRef.current = true;
            try {
              await activeFaceMesh.send({ image: currentVideo });
            } catch {
              // Keep stream alive even when individual face inference frames fail.
            } finally {
              frameInFlightRef.current = false;
            }
          }

          poseFrameCounterRef.current += 1;
          const shouldRunPose = poseFrameCounterRef.current % 2 === 0;

          if (shouldRunPose && activePose && !poseInFlightRef.current && currentVideo.readyState >= 2) {
            poseInFlightRef.current = true;
            try {
              await activePose.send({ image: currentVideo });
            } catch {
              // Keep stream alive even when individual pose inference frames fail.
            } finally {
              poseInFlightRef.current = false;
            }
          }

          const now = Date.now();
          const detector = phoneDetectorRef.current;
          const shouldRunPhone =
            detector !== null &&
            currentVideo.readyState >= 2 &&
            now - phoneLastDetectionAtRef.current >= PHONE_DETECTION_INTERVAL_MS;

          if (shouldRunPhone && !phoneInFlightRef.current) {
            phoneInFlightRef.current = true;
            phoneLastDetectionAtRef.current = now;

            try {
              const detections = await detector.detect(currentVideo);
              latestPhoneDetectionsRef.current = detections;

              const hasRawPhone = detections.length > 0;
              const maxConfidence = detections.reduce((max, item) => Math.max(max, item.score), 0);

              if (hasRawPhone) {
                phoneLastSeenAtRef.current = now;
                phoneVisibleStartRef.current = phoneVisibleStartRef.current ?? now;
                setPhoneLastDetectionAt(now);
                setPhoneConfidence(maxConfidence);
              }

              const withinGrace =
                phoneLastSeenAtRef.current !== null && now - phoneLastSeenAtRef.current <= PHONE_VISIBILITY_GRACE_MS;
              const hasPhone = hasRawPhone || withinGrace;

              if (hasPhone && phoneVisibleStartRef.current !== null) {
                const visibleDuration = now - phoneVisibleStartRef.current;
                setPhoneVisibleDurationMs(visibleDuration);
                phoneDetectedActiveRef.current = visibleDuration >= PHONE_MIN_VISIBLE_MS;
                setPhoneDetected(phoneDetectedActiveRef.current);
              } else {
                phoneVisibleStartRef.current = null;
                phoneLastSeenAtRef.current = null;
                phoneDetectedActiveRef.current = false;
                setPhoneDetected(false);
                setPhoneVisibleDurationMs(0);
                setPhoneConfidence(0);
              }
            } catch {
              // Keep stream alive when phone detection fails on a frame.
            } finally {
              phoneInFlightRef.current = false;
            }
          }

          frameRequestRef.current = requestAnimationFrame(() => {
            void processFrames();
          });
        };

        frameRequestRef.current = requestAnimationFrame(() => {
          void processFrames();
        });
      } catch {
        setError("Video is active, but face/pose analysis failed to initialize.");
      }

      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });

        if (isStale()) {
          for (const track of audioStream.getTracks()) {
            track.stop();
          }
          return;
        }

        audioStreamRef.current = audioStream;
        resetAudioState();

        const audioAnalyzer = new AudioAnalyzer({
          onMetrics: (metrics) => {
            audioMetricsRef.current = metrics;
            setAudioLevel(metrics.level);
            setSpeechActive(metrics.speechActive);

            const now = Date.now();

            if (audioCalibrationStartRef.current === null) {
              audioCalibrationStartRef.current = now;
            }

            const calibrationElapsed = now - audioCalibrationStartRef.current;
            if (calibrationElapsed < policy.audio.calibrationMs) {
              audioCalibrationSamplesRef.current.push(metrics.level);
              setAudioStatus("calibrating");
              speechViolationActiveRef.current = false;
              highNoiseActiveRef.current = false;
              evaluateConditions();
              return;
            }

            if (!audioBaselineReadyRef.current) {
              const samples = audioCalibrationSamplesRef.current;
              const average = samples.length > 0 ? samples.reduce((sum, value) => sum + value, 0) / samples.length : 0.02;
              audioBaselineRef.current = Math.max(0.01, average);
              audioBaselineReadyRef.current = true;
            }

            const baseline = audioBaselineRef.current;
            const noiseThreshold = Math.max(0.03, baseline * policy.audio.noiseMultiplier);
            const loudThreshold = Math.max(0.09, baseline * policy.audio.loudMultiplier);
            const isSpeech = metrics.speechActive;
            const isNoise = metrics.level > noiseThreshold && !isSpeech;
            const isLoud = metrics.level > loudThreshold;

            if (isSpeech) {
              speechStartRef.current = speechStartRef.current ?? now;
            } else {
              speechStartRef.current = null;
            }

            if (isNoise) {
              noiseStartRef.current = noiseStartRef.current ?? now;
            } else {
              noiseStartRef.current = null;
            }

            if (isLoud) {
              loudStartRef.current = loudStartRef.current ?? now;
            } else {
              loudStartRef.current = null;
            }

            const speechDuration = speechStartRef.current ? now - speechStartRef.current : 0;
            const noiseDuration = noiseStartRef.current ? now - noiseStartRef.current : 0;
            const loudDuration = loudStartRef.current ? now - loudStartRef.current : 0;

            const delta = metrics.level - previousAudioLevelRef.current;
            const spikeDetected =
              (isLoud && delta > policy.audio.loudSpikeDelta) || (metrics.suddenLoudNoise && metrics.level > noiseThreshold);

            previousAudioLevelRef.current = metrics.level;

            if (spikeDetected) {
              loudSpikeTimesRef.current.push(now);
            }

            loudSpikeTimesRef.current = loudSpikeTimesRef.current.filter(
              (timestamp) => now - timestamp <= policy.audio.repeatedLoudSpikeWindowMs
            );

            const repeatedSpikes = loudSpikeTimesRef.current.length >= policy.audio.repeatedLoudSpikeCount;
            const technicalSuspiciousSpeechContext =
              roundType !== "technical" || backgroundPersonActiveRef.current || faceStatusRef.current !== "face_ok";
            const speechViolation =
              policy.audio.monitorSpeechViolation &&
              speechDuration >= policy.audio.speechDurationMs &&
              technicalSuspiciousSpeechContext;
            const backgroundNoiseViolation =
              policy.audio.monitorBackgroundNoise && noiseDuration >= policy.audio.backgroundNoiseDurationMs;
            const continuousLoudViolation = loudDuration >= policy.audio.continuousLoudDurationMs;
            const spikeViolation = policy.audio.monitorSpikeNoise && spikeDetected;
            const repeatedSpikeViolation = policy.audio.monitorRepeatedSpikes && repeatedSpikes;

            speechViolationActiveRef.current = speechViolation;
            highNoiseActiveRef.current =
              spikeViolation || repeatedSpikeViolation || backgroundNoiseViolation || continuousLoudViolation;

            if (spikeDetected || isLoud) {
              setAudioStatus("loud");
            } else if (isSpeech) {
              setAudioStatus("speaking");
            } else if (isNoise) {
              setAudioStatus("noisy");
            } else {
              setAudioStatus("quiet");
            }

            evaluateConditions();
          }
        });

        await audioAnalyzer.start(audioStream);
        audioAnalyzerRef.current = audioAnalyzer;
      } catch {
        setError((previous) => previous ?? "Video is active, but microphone access was denied or unavailable.");
      }
    } catch (caughtError) {
      if (isStale()) {
        return;
      }

      stopMonitoring();
      setPermission("denied");
      setError(caughtError instanceof Error ? caughtError.message : "Unable to start media proctoring");
    } finally {
      if (!isStale()) {
        isStartingRef.current = false;
      }
    }
  }, [evaluateConditions, policy.audio, resetAudioState, roundType, stopMonitoring]);

  useEffect(() => {
    void startMonitoring();

    return () => {
      stopMonitoring();
    };
  }, [startMonitoring, stopMonitoring]);

  useEffect(() => {
    activeStartsRef.current = {};
    activeViolationSetRef.current = new Set();
    setActiveViolations([]);
    speechViolationActiveRef.current = false;
    highNoiseActiveRef.current = false;
    lookingDownActiveRef.current = false;
    backgroundPersonActiveRef.current = false;
    possibleDownwardAttentionActiveRef.current = false;
    phoneDetectedActiveRef.current = false;
    latestPhoneDetectionsRef.current = [];
    phoneVisibleStartRef.current = null;
    phoneLastSeenAtRef.current = null;
    reducedEyeStartRef.current = null;
    faceWidthBaselineRef.current = null;
    setDownwardAttentionStatus("clear");
    setPhoneDetected(false);
    setPhoneConfidence(0);
    setPhoneVisibleDurationMs(0);
    setPhoneLastDetectionAt(null);

    integrityscorerRef.current.reset();
    const resetIntegrityData = integrityscorerRef.current.getData();
    setIntegrityScore(resetIntegrityData.integrityScore);
    setIntegrityStatus(resetIntegrityData.integrityStatus);
    setEventCounts(resetIntegrityData.eventCounts);
    setLastUpdated(resetIntegrityData.lastUpdated);
  }, [policy]);

  const statusText = useMemo(() => FACE_STATUS_LABELS[faceStatus], [faceStatus]);

  return {
    videoRef,
    canvasRef,
    isMonitoring,
    permission,
    roundType,
    faceStatus,
    statusText,
    gazeDirection,
    personCount,
    backgroundPersonDetected,
    eyeOpennessPercent,
    downwardAttentionStatus,
    phoneDetected,
    phoneConfidence,
    phoneVisibleDurationMs,
    phoneLastDetectionAt,
    phoneDetectionIntervalMs: PHONE_DETECTION_INTERVAL_MS,
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
  };
}
