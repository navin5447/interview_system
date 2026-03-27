"use client";

type Props = {
  speaking: boolean;
  thinking: boolean;
  questionType?: string;
};

export default function AIAvatar({ speaking, thinking, questionType }: Props) {
  return (
    <div className="panel flex h-full flex-col items-center justify-center p-6 text-center">
      <div className="relative mb-4 h-28 w-28 rounded-full bg-pale">
        {speaking && <span className="absolute inset-0 rounded-full border-2 border-signal/80 animate-ping" />}
        <div className="absolute inset-3 grid place-items-center rounded-full bg-gradient-to-br from-signal to-calm text-2xl font-bold text-white">AI</div>
      </div>

      <p className="title-font text-3xl text-ink">AI Interviewer</p>
      {questionType && <p className="chip mt-1">{questionType}</p>}

      {thinking ? (
        <div className="thinking-dots mt-6 flex gap-2" aria-label="thinking animation">
          <span />
          <span />
          <span />
        </div>
      ) : (
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.16em] text-ink/60">{speaking ? "Speaking" : "Listening"}</p>
      )}
    </div>
  );
}
