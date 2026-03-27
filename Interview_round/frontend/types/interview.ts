export type QuestionItem = {
  id: string;
  question: string;
  type: string;
  difficulty: string;
  expected_keywords: string[];
  assessment_focus?: string | null;
};

export type InterviewConfig = {
  scenario_percentage: number;
  resume_validation_percentage: number;
  total_questions: number;
};

export type SessionState = {
  sessionId: string;
  role: string;
  resumeId: string;
  hrPrompt: string;
  interviewConfig: InterviewConfig;
  questions: QuestionItem[];
  applicationId?: string;
  roundNumber?: string;
  candidateName?: string;
  jobId?: string;
  proxyRound?: string;
};

export type EmotionData = {
  emotion: "Confident" | "Nervous" | "Neutral";
  confidence: number;
  timestamp?: string;
};

export type EvaluationData = {
  scores: Record<string, number | string>;
  feedback: string;
  follow_up: string;
};
