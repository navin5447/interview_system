"use client";

type Props = {
  current: number;
  total: number;
};

export default function ProgressHeader({ current, total }: Props) {
  const pct = total ? Math.min(100, Math.round((current / total) * 100)) : 0;

  return (
    <div className="panel mb-4 p-4">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="title-font text-2xl text-ink">Q{Math.max(current, 1)} / {total}</span>
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-ink/55">{pct}% complete</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-pale">
        <div className="h-full rounded-full bg-gradient-to-r from-signal to-calm transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
