const MAP = {
  pending: { label: 'Pending', color: '#a88bff' },
  running: { label: 'In Progress', color: '#5cc9f5' },
  passed: { label: 'Passed', color: '#22c55e' },
  failed: { label: 'Failed', color: '#f97373' },
  flagged: { label: 'Flagged', color: '#f97316' },
};

export function StatusPill({ status }) {
  const cfg = MAP[status] || MAP.pending;
  const bg = `${cfg.color}1a`;

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium"
      style={{ backgroundColor: bg, color: cfg.color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: cfg.color }} aria-hidden />
      {cfg.label}
    </span>
  );
}
