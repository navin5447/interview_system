"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { reportPdfUrl } from "@/lib/api";

function emotionToScore(emotion: string) {
  if (emotion === "Confident") return 9;
  if (emotion === "Nervous") return 4;
  return 6;
}

function scoreTone(score: number | null | undefined) {
  if (score == null) return "bg-graphite/10 text-ink/70";
  if (score >= 8) return "bg-calm/20 text-calm";
  if (score >= 6) return "bg-signal/15 text-signal";
  return "bg-graphite/20 text-graphite";
}

export default function ReportPage() {
  const [isHydrated, setIsHydrated] = useState(false);
  const [report, setReport] = useState<any | null>(null);

  useEffect(() => {
    setIsHydrated(true);
    const raw = localStorage.getItem("interviewReport");
    setReport(raw ? JSON.parse(raw) : null);
  }, []);

  if (!isHydrated) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8 md:py-12">
        <section className="panel p-6 md:p-8">
          <h1 className="title-font text-5xl text-ink md:text-6xl">Summary Dashboard</h1>
          <p className="mt-2 text-sm font-semibold uppercase tracking-[0.16em] text-ink/60">Loading report...</p>
        </section>
      </main>
    );
  }

  if (!report) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8 md:py-12">
        <section className="panel p-6 md:p-8">
          <h1 className="title-font text-5xl text-ink md:text-6xl">Summary Dashboard</h1>
          <p className="mt-2 text-sm font-semibold uppercase tracking-[0.16em] text-ink/60">No report found.</p>
        </section>
      </main>
    );
  }

  const chartData = (report.emotion_timeline || []).map((item: any, idx: number) => ({
    idx: idx + 1,
    score: emotionToScore(item.emotion),
    emotion: item.emotion
  }));

  const scoredQuestions = (report.per_question || []).filter((item: any) => item.scores?.overall != null);
  const unscoredQuestions = (report.per_question || []).length - scoredQuestions.length;
  const avgQuestionScore = scoredQuestions.length
    ? (scoredQuestions.reduce((sum: number, item: any) => sum + Number(item.scores.overall || 0), 0) / scoredQuestions.length).toFixed(2)
    : "0.00";

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 md:py-12">
      <section className="panel overflow-hidden p-6 md:p-8">
        <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="chip">Interview Report</span>
            <h1 className="title-font mt-2 text-5xl leading-none text-ink md:text-7xl">Summary Dashboard</h1>
            <p className="mt-2 text-sm font-semibold uppercase tracking-[0.16em] text-ink/60">Role: {report.role} · Recommendation: {report.recommendation}</p>
          </div>
          <div className="rounded-2xl bg-gradient-to-r from-signal to-calm p-[1px] shadow-lg">
            <div className="rounded-2xl bg-white px-4 py-3 text-right">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink/55">Report ID</p>
              <p className="text-xs font-bold tracking-wide text-ink">{report.report_id}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-2xl bg-gradient-to-br from-signal to-[#8f74ff] p-5 text-white shadow-lg">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/80">Overall Score</p>
            <p className="mt-1 text-4xl font-bold">{report.overall_score}</p>
          </div>
          <div className="rounded-2xl bg-gradient-to-br from-graphite to-[#3a3a3a] p-5 text-white shadow-lg">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/80">Confidence</p>
            <p className="mt-1 text-4xl font-bold">{report.confidence_score}</p>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink/50">Speech Pace</p>
            <p className="mt-1 text-3xl font-bold text-ink">{report.speech_pace} <span className="text-base font-medium text-ink/60">WPM</span></p>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink/50">Avg Dead-End</p>
            <p className="mt-1 text-3xl font-bold text-ink">{report.avg_dead_end_time ?? 0}<span className="ml-1 text-base font-medium text-ink/60">sec</span></p>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink/50">Avg Question Score</p>
            <p className="mt-1 text-3xl font-bold text-ink">{avgQuestionScore}</p>
            <p className="text-xs font-medium text-ink/60">Unscored: {unscoredQuestions}</p>
          </div>
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl bg-white p-4 shadow">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink/55">Emotion Trend</p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="emotionFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#7353F6" stopOpacity={0.8} />
                      <stop offset="100%" stopColor="#5CC9F5" stopOpacity={0.1} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ece9ff" />
                  <XAxis dataKey="idx" />
                  <YAxis domain={[0, 10]} />
                  <Tooltip />
                  <Area type="monotone" dataKey="score" stroke="#7353F6" strokeWidth={3} fill="url(#emotionFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-2xl bg-white p-4 shadow">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink/55">Emotion Line View</p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#efedf8" />
                  <XAxis dataKey="idx" />
                  <YAxis domain={[0, 10]} />
                  <Tooltip />
                  <Line type="monotone" dataKey="score" stroke="#5CC9F5" strokeWidth={3} dot />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl bg-white p-4 shadow">
            <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-ink/70">Top Strengths</h2>
            <ul className="mt-2 list-disc pl-5 text-sm text-black/80">
              {(report.top_strengths || []).map((item: string, i: number) => <li key={i}>{item}</li>)}
            </ul>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow">
            <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-ink/70">Improvement Areas</h2>
            <ul className="mt-2 list-disc pl-5 text-sm text-black/80">
              {(report.improvement_areas || []).map((item: string, i: number) => <li key={i}>{item}</li>)}
            </ul>
          </div>
        </div>

        <div className="mt-8 rounded-2xl bg-white p-4 shadow">
          <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-ink/70">Per-Question Breakdown</h2>
          <div className="mt-3 space-y-3 text-sm">
            {(report.per_question || []).map((item: any) => (
              <div key={item.question_id} className="rounded-xl border border-ink/10 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-semibold text-ink">{item.question_id}: {item.question}</p>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.1em] ${scoreTone(item.scores?.overall)}`}>
                    {item.scores?.overall == null ? "Not Scored" : `Score ${item.scores.overall}`}
                  </span>
                </div>
                <p className="mt-2 text-black/70">
                  response: {item.response_time ?? 0}s | dead-end: {item.dead_end_time ?? 0}s
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8 flex gap-3">
          <a
            href={reportPdfUrl(report.report_id)}
            className="brand-btn"
            target="_blank"
            rel="noreferrer"
          >
            Download PDF Report
          </a>
          <Link href="/" className="rounded-xl border border-ink/20 bg-white px-4 py-2 text-sm font-semibold text-ink">
            Start New Interview
          </Link>
        </div>
      </section>
    </main>
  );
}
