"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { startSession } from "@/lib/api";
import { requestFullscreenSafe, requestMediaPermission } from "@/lib/proxyGuard";

function HomePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const applicationId = searchParams.get("application_id");
  const roundNumber = searchParams.get("round_number");
  const candidateName = searchParams.get("candidate_name");
  const jobTitle = searchParams.get("job_title");
  const proxyRound = searchParams.get("proxy_round") || "technical";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [securityApproved, setSecurityApproved] = useState(false);
  const [securityError, setSecurityError] = useState("");

  // Auto-start interview when coming from SmartRecruit
  useEffect(() => {
    if (applicationId && roundNumber && securityApproved) {
      startInterviewAutomatically();
    }
  }, [applicationId, roundNumber, securityApproved]);

  async function approveSecurityAndStart() {
    setSecurityError("");
    const mediaOk = await requestMediaPermission();
    if (!mediaOk) {
      setSecurityError("Camera and microphone permission is required to continue.");
      return;
    }

    const fullscreenOk = await requestFullscreenSafe();
    if (!fullscreenOk) {
      setSecurityError("Fullscreen mode is required to continue.");
      return;
    }

    setSecurityApproved(true);
  }

  async function startInterviewAutomatically() {
    setLoading(true);
    setError("");
    try {
      // Use default recruiter-configured settings for this round
      const defaultSettings = {
        role: jobTitle || "Technical Role",
        hrPrompt: "Evaluate technical competency, communication, problem-solving, and cultural alignment.",
        scenarioPercentage: 35,
        resumeValidationPercentage: 25,
        totalQuestions: 10,
      };

      // Create a mock resume object since resume is already in the application
      const mockResumeId = `app_${applicationId}`;

      const session = await startSession({
        resumeId: mockResumeId,
        role: defaultSettings.role,
        hrPrompt: defaultSettings.hrPrompt,
        scenarioPercentage: defaultSettings.scenarioPercentage,
        resumeValidationPercentage: defaultSettings.resumeValidationPercentage,
        totalQuestions: defaultSettings.totalQuestions,
      });

      localStorage.setItem(
        "interviewSession",
        JSON.stringify({
          sessionId: session.session_id,
          role: defaultSettings.role,
          resumeId: mockResumeId,
          hrPrompt: defaultSettings.hrPrompt,
          interviewConfig: session.interview_config,
          questions: session.questions,
          applicationId: applicationId,
          roundNumber: roundNumber,
          candidateName: candidateName,
          proxyRound,
        })
      );

      router.push("/interview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to start interview");
      setLoading(false);
    }
  }

  // Show loading screen while auto-starting
  if (applicationId && roundNumber) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-12">
        {!securityApproved ? (
          <section className="panel mb-6 p-6 md:p-8">
            <h2 className="title-font text-3xl text-ink mb-4">Security Check Required</h2>
            <ul className="list-disc pl-5 text-sm text-ink/80 space-y-2">
              <li>Fullscreen mode is mandatory during this round.</li>
              <li>Tab switching/window blur events are monitored and reduce proxy score.</li>
              <li>Camera and microphone monitoring is active throughout the round.</li>
            </ul>
            {securityError && <p className="mt-4 text-sm font-semibold text-red-600">{securityError}</p>}
            <button onClick={approveSecurityAndStart} className="brand-btn mt-5">I Agree, Start Secure Round</button>
          </section>
        ) : null}

        <section className="panel overflow-hidden p-8 md:p-10 text-center">
          <div className="mb-8">
            <span className="chip">Agentica Interview</span>
          </div>

          <div className="mb-6 rounded-lg border border-signal/30 bg-signal/5 p-4">
            <p className="text-sm font-medium text-ink/80">
              <strong>Round {roundNumber}:</strong> {jobTitle || "Technical Interview"}
              {candidateName && <span className="text-ink/60"> • {candidateName}</span>}
            </p>
          </div>

          <h1 className="title-font text-4xl leading-none text-ink md:text-5xl mb-4">
            Starting Your Interview
          </h1>

          {securityApproved && loading ? (
            <>
              <div className="flex justify-center mb-4">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-signal"></div>
              </div>
              <p className="text-sm font-medium text-ink/70">
                Preparing your AI interview session...
              </p>
            </>
          ) : !securityApproved ? (
            <p className="text-sm font-medium text-ink/70">
              Approve the security checks above to continue.
            </p>
          ) : error ? (
            <>
              <p className="text-sm font-semibold text-red-600 mb-4">{error}</p>
              <button
                onClick={() => startInterviewAutomatically()}
                className="brand-btn"
              >
                Try Again
              </button>
            </>
          ) : null}
        </section>
      </main>
    );
  }

  // Fallback: Show this if accessed without application_id (shouldn't happen normally)
  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <section className="panel overflow-hidden p-8 md:p-10">
        <div className="mb-8 flex items-center justify-between">
          <span className="chip">Agentica Interview</span>
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-ink/55">Voice + Video</span>
        </div>

        <h1 className="title-font text-5xl leading-none text-ink md:text-6xl">Error</h1>
        <p className="mt-3 max-w-2xl text-sm font-medium text-ink/70 md:text-base">
          This page should be accessed from your SmartRecruit application. Please go back and click "Start Interview" again.
        </p>
      </section>
    </main>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-5xl px-4 py-12">Loading...</main>}>
      <HomePageContent />
    </Suspense>
  );
}
