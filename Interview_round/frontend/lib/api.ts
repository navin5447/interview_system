import { QuestionItem } from "@/types/interview";

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
}

function getApiBase() {
  if (process.env.NEXT_PUBLIC_API_BASE) {
    return process.env.NEXT_PUBLIC_API_BASE;
  }

  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:8004`;
  }

  return "http://127.0.0.1:8004";
}

export async function uploadResume(file: File) {
  const apiBase = getApiBase();
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${apiBase}/api/upload-resume`, {
    method: "POST",
    body: formData
  });

  if (!res.ok) throw new Error("Failed to upload resume");
  return res.json();
}

export async function startSession(payload: {
  resumeId: string;
  role: string;
  candidateName?: string;
  interviewStage?: string;
  conversationHistory?: Array<{ role: string; text: string }>;
  hrPrompt: string;
  scenarioPercentage: number;
  resumeValidationPercentage: number;
  totalQuestions: number;
  resumeSummary?: string;
  resumeSkills?: string[];
  resumeRawText?: string;
}): Promise<{
  session_id: string;
  questions: QuestionItem[];
  interview_config: {
    scenario_percentage: number;
    resume_validation_percentage: number;
    total_questions: number;
  };
}> {
  const apiBase = getApiBase();
  const res = await fetch(`${apiBase}/api/start-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      resume_id: payload.resumeId,
      role: payload.role,
      candidate_name: payload.candidateName || "",
      interview_stage: payload.interviewStage || "Technical Round",
      conversation_history: payload.conversationHistory || [],
      hr_prompt: payload.hrPrompt,
      scenario_percentage: payload.scenarioPercentage,
      resume_validation_percentage: payload.resumeValidationPercentage,
      total_questions: payload.totalQuestions,
      resume_summary: payload.resumeSummary || "",
      resume_skills: payload.resumeSkills || [],
      resume_raw_text: payload.resumeRawText || ""
    })
  });

  if (!res.ok) throw new Error("Failed to start session");
  return res.json();
}

export async function transcribeChunk(payload: {
  sessionId: string;
  questionId: string;
  questionText: string;
  expectedKeywords: string[];
  elapsedSeconds: number;
  blob: Blob;
}) {
  const apiBase = getApiBase();
  const form = new FormData();
  form.append("session_id", payload.sessionId);
  form.append("question_id", payload.questionId);
  form.append("question_text", payload.questionText);
  form.append("expected_keywords", JSON.stringify(payload.expectedKeywords));
  form.append("elapsed_seconds", payload.elapsedSeconds.toString());
  const mime = payload.blob.type || "audio/webm";
  let filename = "chunk.webm";
  if (mime.includes("ogg")) {
    filename = "chunk.ogg";
  } else if (mime.includes("mp4") || mime.includes("m4a")) {
    filename = "chunk.mp4";
  }
  form.append("audio_mime_type", mime);
  form.append("audio", payload.blob, filename);

  const res = await fetchWithTimeout(`${apiBase}/api/transcribe`, {
    method: "POST",
    body: form
  }, 12000);
  if (!res.ok) throw new Error("Transcription failed");
  return res.json();
}

export async function analyzeFrame(sessionId: string, imageBase64: string) {
  const apiBase = getApiBase();
  const res = await fetch(`${apiBase}/api/analyze-frame`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, image_base64: imageBase64 })
  });
  if (!res.ok) throw new Error("Frame analysis failed");
  return res.json();
}

export async function evaluateResponse(payload: {
  sessionId: string;
  questionId: string;
  question: string;
  transcript: string;
  keywords: string[];
  questionType?: string;
  assessmentFocus?: string;
  responseTimeSeconds: number;
  deadEndTimeSeconds: number;
}) {
  const apiBase = getApiBase();
  const res = await fetchWithTimeout(`${apiBase}/api/evaluate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: payload.sessionId,
      question_id: payload.questionId,
      question: payload.question,
      transcript: payload.transcript,
      keywords: payload.keywords,
      question_type: payload.questionType || "",
      assessment_focus: payload.assessmentFocus || "",
      response_time_seconds: payload.responseTimeSeconds,
      dead_end_time_seconds: payload.deadEndTimeSeconds
    })
  }, 20000);

  if (!res.ok) throw new Error("Evaluation failed");
  return res.json();
}

export async function endSession(sessionId: string) {
  const apiBase = getApiBase();
  const res = await fetchWithTimeout(`${apiBase}/api/end-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId })
  }, 30000);

  if (!res.ok) throw new Error("Failed to end session");
  return res.json();
}

export async function fetchNextQuestion(payload: {
  sessionId: string;
  currentQuestionId: string;
}): Promise<{
  question: QuestionItem | null;
  done: boolean;
  total_questions: number;
}> {
  const apiBase = getApiBase();
  const res = await fetchWithTimeout(`${apiBase}/api/next-question`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: payload.sessionId,
      current_question_id: payload.currentQuestionId,
    })
  }, 20000);

  if (!res.ok) throw new Error("Failed to fetch next question");
  return res.json();
}

export async function fetchTtsAudio(text: string): Promise<Blob> {
  const apiBase = getApiBase();
  const res = await fetchWithTimeout(`${apiBase}/api/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text })
  }, 12000);

  if (!res.ok) throw new Error("TTS generation failed");
  return res.blob();
}

export function reportPdfUrl(reportId: string) {
  return `${getApiBase()}/api/report/${reportId}`;
}
