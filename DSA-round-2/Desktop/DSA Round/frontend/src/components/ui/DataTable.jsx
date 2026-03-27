export function DataTable({ children }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-borderSubtle bg-surface shadow-[var(--shadow-soft)]">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}
