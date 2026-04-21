// Linear bar — week-level adherence. The 80% qualifying line is marked.

export function AdherenceBar({ value }: { value: number | null }) {
  const v = Math.max(0, Math.min(100, value ?? 0));
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
      <div
        className="h-full bg-emerald-500 transition-[width] duration-500"
        style={{ width: `${v}%` }}
      />
      {/* 80% qualifying threshold marker */}
      <div
        className="absolute top-0 h-full w-px bg-zinc-400/70 dark:bg-zinc-500/70"
        style={{ left: '80%' }}
        aria-hidden
      />
    </div>
  );
}
