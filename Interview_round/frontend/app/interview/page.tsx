"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as tf from "@tensorflow/tfjs";
import * as cocoSsd from "@tensorflow-models/coco-ssd";
import * as mpFaceDetection from "@mediapipe/face_detection";

import AIAvatar from "@/components/AIAvatar";
import ProgressHeader from "@/components/ProgressHeader";
import WebcamPanel from "@/components/WebcamPanel";
import { analyzeFrame, endSession, evaluateResponse, fetchTtsAudio, transcribeChunk } from "@/lib/api";
import { DEFAULT_PROXY_SCORE, getProxyPenalty, isFullscreenActive, requestFullscreenSafe } from "@/lib/proxyGuard";
import type { ProxyViolation } from "@/lib/proxyGuard";
import { createInterviewSocket } from "@/lib/ws";
import { EmotionData, QuestionItem, SessionState } from "@/types/interview";

const defaultEmotion: EmotionData = { emotion: "Neutral", confidence: 0 };

function normalizeQuestionForSpeech(raw: string) {
  return raw
    .replace(/\s+/g, " ")
    .replace(/^\s*\d+[.)-]\s*/, "")
    .replace(/["'`]/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\bJS\b/g, "JavaScript")
    .replace(/\bTS\b/g, "TypeScript")
    .replace(/\bAPI\b/g, "A P I")
    .replace(/\bSQL\b/g, "S Q L")
    .replace(/\bNoSQL\b/g, "No S Q L")
    .replace(/\bCI\/CD\b/g, "C I C D")
    .replace(/\bCRUD\b/g, "C R U D")
    .replace(/\bK8s\b/gi, "Kubernetes")
    .replace(/\be\.g\.\b/gi, "for example")
    .replace(/\bi\.e\.\b/gi, "that is")
    .replace(/[{}\[\]|<>]/g, " ")
    .replace(/[;:]/g, ",")
    .replace(/\s+,/g, ",")
    .trim();
}

function splitForClearSpeech(text: string) {
  const bySentence = text
    .split(/[?.!]/)
    .map((part) => part.trim())
    .filter(Boolean);

  const segments: string[] = [];
  for (const sentence of bySentence) {
    const chunks = sentence
      .split(/,|\s+and\s+|\s+or\s+/i)
      .map((part) => part.trim())
      .filter(Boolean);

    if (!chunks.length) continue;
    if (chunks.length === 1) {
      segments.push(chunks[0]);
      continue;
    }

    chunks.forEach((chunk, idx) => {
      if (idx === chunks.length - 1) {
        segments.push(`and ${chunk}`);
      } else {
        segments.push(chunk);
      }
    });
  }

  return segments.length ? segments : [text];
}

function pickInterviewVoice(voices: SpeechSynthesisVoice[]) {
  const preferred = [
    "Google US English",
    "Microsoft Aria Online (Natural) - English (United States)",
    "Microsoft Jenny Online (Natural) - English (United States)",
    "Samantha",
  ];

  for (const name of preferred) {
    const found = voices.find((v) => v.name === name);
    if (found) return found;
  }

  const english = voices.find((v) => v.lang.toLowerCase().startsWith("en"));
  return english ?? null;
}

type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: any) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type VisionModels = {
  objectDetector: any;
  faceDetector: any;
};

function loadScriptOnce(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      resolve();
      return;
    }

    const existing = document.querySelector(`script[data-proxy-src="${src}"]`) as HTMLScriptElement | null;
    if (existing) {
      if (existing.dataset.loaded === "1") {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.proxySrc = src;
    script.addEventListener("load", () => {
      script.dataset.loaded = "1";
      resolve();
    }, { once: true });
    script.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), { once: true });
    document.head.appendChild(script);
  });
}

export default function InterviewPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionState | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [currentTranscript, setCurrentTranscript] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [emotion, setEmotion] = useState<EmotionData>(defaultEmotion);
  const [followUp, setFollowUp] = useState("");
  const [liveSubtitle, setLiveSubtitle] = useState("");
  const [status, setStatus] = useState("Initializing interview...");
  const [proxyScore, setProxyScore] = useState<number>(DEFAULT_PROXY_SCORE);
  const [proxyViolations, setProxyViolations] = useState<ProxyViolation[]>([]);

  const streamRef = useRef<MediaStream | null>(null);
  const proxyVideoRef = useRef<HTMLVideoElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const startRef = useRef<number>(Date.now());
  const lastTranscriptAtRef = useRef<number>(Date.now());
  const transcriptMapRef = useRef<Record<string, string>>({});
  const evaluatedMapRef = useRef<Record<string, boolean>>({});
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const pendingTranscriptionsRef = useRef(new Set<Promise<void>>());
  const shouldStartRecordingRef = useRef(false);
  const speechRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const speechFinalRef = useRef("");
  const speechMapRef = useRef<Record<string, string>>({});
  const visionModelsRef = useRef<VisionModels | null>(null);
  const visionIntervalRef = useRef<number | null>(null);
  const visionInFlightRef = useRef(false);
  const noFaceStreakRef = useRef(0);
  const violationCooldownRef = useRef<Record<string, number>>({});

  const questions = session?.questions ?? [];
  const question: QuestionItem | undefined = useMemo(() => questions[currentIdx], [questions, currentIdx]);

  const ensureVisionModels = useCallback(async () => {
    if (visionModelsRef.current) return true;

    try {
      await tf.ready();

      const objectDetector = await cocoSsd.load({
        base: 'mobilenet_v2'
      });

      const FaceDetectionCtor = mpFaceDetection.FaceDetection || (window as any).FaceDetection;
      if (!FaceDetectionCtor) {
        return false;
      }

      const faceDetector = new FaceDetectionCtor({
        locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/${file}`
      });
      faceDetector.setOptions({ 
        model: 'short' as any,
        minDetectionConfidence: 0.5 
      } as any);

      visionModelsRef.current = { objectDetector, faceDetector };
      return true;
    } catch (error) {
      console.error('Failed to load vision models:', error);
      return false;
    }
  }, []);

  const detectPhone = useCallback(async () => {
    const models = visionModelsRef.current;
    const video = proxyVideoRef.current;
    if (!models || !video) return false;
    const predictions = await models.objectDetector.detect(video);
    return predictions.some((item: any) => item.class === "cell phone" && item.score >= 0.5);
  }, []);

  const detectFaceCount = useCallback(async () => {
    const models = visionModelsRef.current;
    const video = proxyVideoRef.current;
    if (!models || !video) return 0;

    return new Promise<number>((resolve) => {
      const timer = window.setTimeout(() => resolve(0), 1200);
      models.faceDetector.onResults((result: any) => {
        window.clearTimeout(timer);
        const count = Array.isArray(result?.detections) ? result.detections.length : 0;
        resolve(count);
      });
      models.faceDetector.send({ image: video }).catch(() => {
        window.clearTimeout(timer);
        resolve(0);
      });
    });
  }, []);

  useEffect(() => {
    if (!("speechSynthesis" in window)) return;

    const setVoice = () => {
      const voices = speechSynthesis.getVoices();
      voiceRef.current = pickInterviewVoice(voices);
    };

    setVoice();
    speechSynthesis.addEventListener("voiceschanged", setVoice);
    return () => {
      speechSynthesis.removeEventListener("voiceschanged", setVoice);
    };
  }, []);

  const speakQuestion = useCallback(async (text: string) => {
    const cleaned = normalizeQuestionForSpeech(text);
    const spoken = cleaned.endsWith("?") ? cleaned.slice(0, -1) : cleaned;
    const segments = ["Next question", ...splitForClearSpeech(spoken), "Take your time and answer clearly"];
    const fullSpeech = `${segments.join(". ")}.`;

    setIsSpeaking(true);

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }

    try {
      const blob = await fetchTtsAudio(fullSpeech);
      const url = URL.createObjectURL(blob);
      audioUrlRef.current = url;

      await new Promise<void>((resolve, reject) => {
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => resolve();
        audio.onerror = () => reject(new Error("Audio playback failed"));
        audio.play().catch(reject);
      });
    } catch {
      await new Promise<void>((resolve) => {
        if (!("speechSynthesis" in window)) {
          resolve();
          return;
        }

        let idx = 0;
        const speakNext = () => {
          if (idx >= segments.length) {
            resolve();
            return;
          }

          const utter = new SpeechSynthesisUtterance(segments[idx]);
          utter.rate = 0.8;
          utter.pitch = 0.98;
          utter.volume = 1.0;
          utter.lang = "en-US";
          if (voiceRef.current) {
            utter.voice = voiceRef.current;
            utter.lang = voiceRef.current.lang || "en-US";
          }

          utter.onend = () => {
            idx += 1;
            window.setTimeout(speakNext, 180);
          };
          utter.onerror = () => {
            idx += 1;
            window.setTimeout(speakNext, 120);
          };

          speechSynthesis.speak(utter);
        };

        speechSynthesis.cancel();
        speakNext();
      });
    } finally {
      setIsSpeaking(false);
      (audioRef.current as HTMLAudioElement | null)?.pause();
      audioRef.current = null;
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
    }
  }, []);

  useEffect(() => {
    return () => {
      try {
        speechRecognitionRef.current?.stop();
      } catch {
        // no-op
      }
      (audioRef.current as HTMLAudioElement | null)?.pause();
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
      }
    };
  }, []);

  const waitForPendingTranscriptions = useCallback(async () => {
    // Flush in-flight transcription calls (including the final chunk emitted on recorder stop).
    while (pendingTranscriptionsRef.current.size > 0) {
      const pending = Array.from(pendingTranscriptionsRef.current);
      await Promise.allSettled(pending);
    }
  }, []);

  const startLiveRecognition = useCallback(() => {
    if (!question) return;

    const maybeCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!maybeCtor) {
      setLiveSubtitle("");
      return;
    }

    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
      } catch {
        // no-op
      }
      speechRecognitionRef.current = null;
    }

    const recognition = new maybeCtor() as BrowserSpeechRecognition;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    speechFinalRef.current = speechMapRef.current[question.id] || "";
    setLiveSubtitle(speechFinalRef.current);

    recognition.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const segment = event.results[i]?.[0]?.transcript || "";
        if (event.results[i].isFinal) {
          speechFinalRef.current = `${speechFinalRef.current} ${segment}`.trim();
        } else {
          interim += segment;
        }
      }

      const caption = `${speechFinalRef.current} ${interim}`.trim();
      if (caption) {
        setLiveSubtitle(caption);
      }
    };

    recognition.onerror = () => {
      setLiveSubtitle(speechFinalRef.current || "");
    };

    recognition.onend = () => {
      speechMapRef.current[question.id] = speechFinalRef.current.trim();
      setLiveSubtitle(speechFinalRef.current || "");
    };

    try {
      recognition.start();
      speechRecognitionRef.current = recognition;
    } catch {
      speechRecognitionRef.current = null;
    }
  }, [question]);

  const stopLiveRecognition = useCallback(async () => {
    const recognition = speechRecognitionRef.current;
    if (!recognition || !question) return;

    await new Promise<void>((resolve) => {
      let done = false;
      const finalize = () => {
        if (done) return;
        done = true;
        resolve();
      };

      recognition.onend = () => {
        speechMapRef.current[question.id] = speechFinalRef.current.trim();
        setLiveSubtitle(speechFinalRef.current || "");
        finalize();
      };

      window.setTimeout(finalize, 700);

      try {
        recognition.stop();
      } catch {
        finalize();
      }
    });

    speechRecognitionRef.current = null;
  }, [question]);

  const stopRecording = useCallback(async () => {
    const recorder = recorderRef.current;

    if (!recorder || recorder.state === "inactive") {
      setIsRecording(false);
      await stopLiveRecognition();
      await waitForPendingTranscriptions();
      return;
    }

    await new Promise<void>((resolve) => {
      recorder.addEventListener(
        "stop",
        () => {
          resolve();
        },
        { once: true }
      );
      recorder.stop();
    });

    setIsRecording(false);
    await stopLiveRecognition();
    await waitForPendingTranscriptions();
  }, [stopLiveRecognition, waitForPendingTranscriptions]);

  const startRecording = useCallback(() => {
    if (!session || !question) return;

    if (!streamRef.current) {
      shouldStartRecordingRef.current = true;
      setStatus("Waiting for microphone access...");
      return;
    }

    shouldStartRecordingRef.current = false;

    const audioTracks = streamRef.current.getAudioTracks();
    if (!audioTracks.length) {
      setStatus("Microphone track is unavailable.");
      return;
    }

    const audioOnlyStream = new MediaStream(audioTracks);
    const preferredTypes = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus"
    ];

    const supportedType = preferredTypes.find((type) => MediaRecorder.isTypeSupported(type));

    let recorder: MediaRecorder;
    try {
      recorder = supportedType ? new MediaRecorder(audioOnlyStream, { mimeType: supportedType }) : new MediaRecorder(audioOnlyStream);
    } catch {
      setStatus("Audio recording is not supported in this browser.");
      return;
    }

    recorderRef.current = recorder;
    setIsRecording(true);
    startRef.current = Date.now();
    lastTranscriptAtRef.current = startRef.current;

    recorder.ondataavailable = (event) => {
      if (!event.data.size || !session || !question) return;

      const transcriptionTask = (async () => {
        try {
          const elapsed = (Date.now() - startRef.current) / 1000;
          const res = await transcribeChunk({
            sessionId: session.sessionId,
            questionId: question.id,
            questionText: question.question,
            expectedKeywords: question.expected_keywords,
            elapsedSeconds: elapsed,
            blob: event.data
          });
          const text = (res.transcript || "").trim();
          if (text.length > 0) {
            lastTranscriptAtRef.current = Date.now();
            setCurrentTranscript((prev: string) => {
              const merged = `${prev} ${text}`.trim();
              transcriptMapRef.current[question.id] = merged;
              return merged;
            });
          }
        } catch {
          setStatus("Transcription failed for one chunk.");
        }
      })();

      pendingTranscriptionsRef.current.add(transcriptionTask);
      transcriptionTask.finally(() => {
        pendingTranscriptionsRef.current.delete(transcriptionTask);
      });
    };

    recorder.start(2000);
    startLiveRecognition();
    setStatus("Recording candidate answer...");
  }, [question, session, startLiveRecognition]);

  const runQuestion = useCallback(async () => {
    if (!question) return;
    shouldStartRecordingRef.current = true;
    setFollowUp("");
    setCurrentTranscript(transcriptMapRef.current[question.id] ?? "");
    setLiveSubtitle("");
    setStatus("AI interviewer speaking...");
    await speakQuestion(question.question);
    startRecording();
  }, [question, speakQuestion, startRecording]);

  const handleFrame = useCallback(
    async (base64: string) => {
      if (!session) return;
      try {
        const res = await analyzeFrame(session.sessionId, base64);
        setEmotion({ emotion: res.emotion, confidence: res.confidence, timestamp: res.timestamp });
      } catch {
        // keep UI running if frame analysis fails
      }
    },
    [session]
  );

  const submitEvaluation = useCallback(async (silent = false) => {
    if (!session || !question) return;
    await stopRecording();
    setIsThinking(true);
    if (!silent) {
      setStatus("Evaluating answer...");
    }

    try {
      const transcriptSnapshot = `${transcriptMapRef.current[question.id] ?? ""} ${currentTranscript}`;
      const cleanedBackendTranscript = transcriptSnapshot.trim();
      const speechTranscript = (speechMapRef.current[question.id] || speechFinalRef.current || "").trim();

      const backendWords = cleanedBackendTranscript ? cleanedBackendTranscript.split(/\s+/).length : 0;
      const speechWords = speechTranscript ? speechTranscript.split(/\s+/).length : 0;
      const cleanedTranscript = speechWords > backendWords ? speechTranscript : cleanedBackendTranscript;

      transcriptMapRef.current[question.id] = cleanedTranscript;
      setCurrentTranscript(cleanedTranscript);
      const responseTimeSeconds = Math.max(0, (Date.now() - startRef.current) / 1000);
      const deadEndTimeSeconds = cleanedTranscript
        ? Math.max(0, (Date.now() - lastTranscriptAtRef.current) / 1000)
        : responseTimeSeconds;

      const result = await evaluateResponse({
        sessionId: session.sessionId,
        questionId: question.id,
        question: question.question,
        transcript: cleanedTranscript,
        keywords: question.expected_keywords,
        questionType: question.type,
        assessmentFocus: question.assessment_focus || "",
        responseTimeSeconds,
        deadEndTimeSeconds,
      });

      evaluatedMapRef.current[question.id] = true;
      setFollowUp(result.follow_up);
      if (!cleanedTranscript) {
        setStatus("No response received. This question was not scored.");
      } else {
        setStatus("Evaluation complete.");
      }
      return true;
    } catch {
      setStatus("Evaluation failed.");
      return false;
    } finally {
      setIsThinking(false);
    }
  }, [currentTranscript, question, session, stopRecording]);

  const handleEvaluate = useCallback(async () => {
    await submitEvaluation(false);
  }, [submitEvaluation]);

  const handleNext = useCallback(async () => {
    if (!session || !question) return;
    if (isThinking) return;

    if (!evaluatedMapRef.current[question.id]) {
      const ok = await submitEvaluation(true);
      if (!ok) {
        setStatus("Please retry evaluation before moving to next question.");
        return;
      }
    }

    if (currentIdx >= questions.length - 1) {
      setStatus("Finalizing report...");
      const report = await endSession(session.sessionId);
      localStorage.setItem("interviewReport", JSON.stringify(report));
      
      // Notify SmartRecruit that interview is complete
      try {
        const completePayload = {
          session_id: session.sessionId,
          application_id: session.applicationId,
          round_number: session.roundNumber,
          round_score: report.overall_score ?? 0,
          evaluation_data: {
            recommendation: report.recommendation,
            confidence_score: report.confidence_score,
            avg_response_time: report.avg_response_time,
            filler_word_count: report.filler_word_count,
            top_strengths: report.top_strengths,
            improvement_areas: report.improvement_areas,
            report_id: report.report_id,
            proxy_score: proxyScore,
            proxy_events: proxyViolations,
            proxy_round: session.proxyRound,
          },
        };
        
        await fetch("http://127.0.0.1:8004/api/complete-interview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(completePayload),
        });
      } catch (err) {
        console.error("Failed to notify SmartRecruit:", err);
        // Continue anyway - interview is already completed
      }
      
      router.push(`/report?id=${report.report_id}`);
      return;
    }

    setFollowUp("");
    setCurrentIdx((idx: number) => idx + 1);
  }, [currentIdx, isThinking, proxyScore, proxyViolations, question, questions.length, router, session, submitEvaluation]);

  const onStreamReady = useCallback((stream: MediaStream) => {
    streamRef.current = stream;

    if (proxyVideoRef.current) {
      proxyVideoRef.current.srcObject = stream;
      proxyVideoRef.current.play().catch(() => {});
    }

    // Create local RTCPeerConnection so media tracks are managed through WebRTC primitives.
    const pc = new RTCPeerConnection();
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    if (shouldStartRecordingRef.current && !isSpeaking && !isRecording) {
      startRecording();
    }
  }, [isRecording, isSpeaking, startRecording]);

  useEffect(() => {
    if (!isSpeaking && shouldStartRecordingRef.current && !isRecording) {
      startRecording();
    }
  }, [isRecording, isSpeaking, startRecording]);

  useEffect(() => {
    const raw = localStorage.getItem("interviewSession");
    if (!raw) {
      router.push("/");
      return;
    }
    const parsed = JSON.parse(raw) as SessionState;
    setSession(parsed);
  }, [router]);

  useEffect(() => {
    if (!session) return;

    requestFullscreenSafe();

    const applyViolation = (
      type: "tab_hidden" | "window_blur" | "fullscreen_exit" | "phone_detected" | "multiple_faces" | "no_face",
      cooldownMs = 4000
    ) => {
      const now = Date.now();
      const lastAt = violationCooldownRef.current[type] || 0;
      if (now - lastAt < cooldownMs) {
        return;
      }

      violationCooldownRef.current[type] = now;
      const penalty = getProxyPenalty(session.proxyRound, type);
      setProxyScore((previous) => Math.max(0, previous - penalty));
      setProxyViolations((previous) => [...previous, { type, penalty, timestamp: Date.now() }]);
    };

    const onVisibility = () => {
      if (document.hidden) {
        setStatus("Security warning: tab switch detected.");
        applyViolation("tab_hidden");
      }
    };

    const onBlur = () => {
      setStatus("Security warning: window focus lost.");
      applyViolation("window_blur");
    };

    const onFullscreenChange = () => {
      if (!isFullscreenActive()) {
        setStatus("Security warning: fullscreen exited.");
        applyViolation("fullscreen_exit");
        requestFullscreenSafe();
      }
    };

    const runVisionChecks = async () => {
      if (visionInFlightRef.current || !proxyVideoRef.current || proxyVideoRef.current.readyState < 2) {
        return;
      }

      visionInFlightRef.current = true;
      try {
        const [phoneDetected, faceCount] = await Promise.all([detectPhone(), detectFaceCount()]);

        if (phoneDetected) {
          setStatus("Security warning: phone detected.");
          applyViolation("phone_detected", 9000);
        }

        if (faceCount > 1) {
          setStatus("Security warning: multiple faces detected.");
          noFaceStreakRef.current = 0;
          applyViolation("multiple_faces", 9000);
        } else if (faceCount === 0) {
          noFaceStreakRef.current += 1;
          if (noFaceStreakRef.current >= 2) {
            setStatus("Security warning: candidate face not visible.");
            applyViolation("no_face", 9000);
            noFaceStreakRef.current = 0;
          }
        } else {
          noFaceStreakRef.current = 0;
        }
      } finally {
        visionInFlightRef.current = false;
      }
    };

    const fullscreenGuard = window.setInterval(() => {
      if (!isFullscreenActive()) {
        setStatus("Security warning: fullscreen exited.");
        applyViolation("fullscreen_exit");
        requestFullscreenSafe();
      }
    }, 1500);

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("webkitfullscreenchange", onFullscreenChange as EventListener);
    document.addEventListener("MSFullscreenChange", onFullscreenChange as EventListener);

    ensureVisionModels().then((ok) => {
      if (!ok) return;
      if (visionIntervalRef.current) {
        window.clearInterval(visionIntervalRef.current);
      }
      visionIntervalRef.current = window.setInterval(() => {
        runVisionChecks();
      }, 2500);
    });

    return () => {
      window.clearInterval(fullscreenGuard);
      if (visionIntervalRef.current) {
        window.clearInterval(visionIntervalRef.current);
        visionIntervalRef.current = null;
      }
      visionInFlightRef.current = false;
      noFaceStreakRef.current = 0;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", onFullscreenChange as EventListener);
      document.removeEventListener("MSFullscreenChange", onFullscreenChange as EventListener);
    };
  }, [session, detectFaceCount, detectPhone, ensureVisionModels]);

  useEffect(() => {
    if (!session) return;

    const ws = createInterviewSocket(session.sessionId, (event, data) => {
      if (event === "interview:transcript_update") {
        // Transcript updates are already applied from direct /transcribe responses.
      }
      if (event === "interview:emotion_update") {
        setEmotion({ emotion: data.emotion, confidence: data.confidence });
      }
      if (event === "interview:evaluation_done") {
        setFollowUp(data.follow_up);
      }
      if (event === "interview:session_end") {
        router.push(`/report?id=${data.report_id}`);
      }
    });

    ws.onopen = () => {
      const current = session.questions[currentIdx];
      if (!current) return;
      ws.send(
        JSON.stringify({
          event: "interview:question_start",
          data: { question_text: current.question, question_number: currentIdx + 1 }
        })
      );
    };

    socketRef.current = ws;
    return () => {
      ws.close();
      socketRef.current = null;
    };
  }, [router, session]);

  useEffect(() => {
    if (!question || !session) return;
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          event: "interview:question_start",
          data: { question_text: question.question, question_number: currentIdx + 1 }
        })
      );
    }
    runQuestion();
  }, [currentIdx, question, runQuestion, session]);

  if (!session || !question) {
    return <main className="mx-auto max-w-5xl px-4 py-8">Loading interview...</main>;
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <video ref={proxyVideoRef} className="hidden" muted playsInline />
      <ProgressHeader current={currentIdx + 1} total={questions.length} />

      <div className="grid gap-4 md:grid-cols-2">
        <WebcamPanel emotion={emotion} subtitleText={liveSubtitle} onFrame={handleFrame} onStreamReady={onStreamReady} />
        <AIAvatar speaking={isSpeaking} thinking={isThinking} questionType={question.type} />
      </div>

      <section className="panel mt-4 p-5">
        <h2 className="title-font text-4xl text-ink">Current Question</h2>
        <p className="mt-1 text-sm font-semibold uppercase tracking-[0.14em] text-ink/55">{question.type} · {question.difficulty}</p>
        <p className="mt-3 text-black/80">{question.question}</p>

        <h3 className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-ink/50">Live Transcript</h3>
        <p className="mt-2 min-h-16 rounded-xl border border-ink/10 bg-white p-3 text-sm">{currentTranscript || "Waiting for candidate response..."}</p>

        {followUp && (
          <div className="mt-4 rounded-xl bg-pale p-3">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-signal">Adaptive Follow-up</p>
            <p className="mt-1 text-sm">{followUp}</p>
          </div>
        )}

        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.12em] text-ink/60">{status}</p>
        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-ink/60">Proxy Score: {proxyScore}</p>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            onClick={handleEvaluate}
            className="rounded-xl bg-graphite px-4 py-2 text-sm font-semibold text-white"
            disabled={isThinking}
          >
            Stop & Evaluate
          </button>
          <button
            onClick={handleNext}
            className="brand-btn"
            disabled={isThinking}
          >
            {currentIdx >= questions.length - 1 ? "End Session" : "Next Question"}
          </button>
        </div>
      </section>
    </main>
  );
}