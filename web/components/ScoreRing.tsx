// Minimal SVG ring. No labels inside — the number lives next to it.

export function ScoreRing({ value, size = 64, stroke = 6 }: {
  value: number | null;
  size?: number;
  stroke?: number;
}) {
  const v = Math.max(0, Math.min(100, value ?? 0));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (v / 100) * c;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none"
        className="stroke-zinc-200 dark:stroke-zinc-800"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none"
        className="stroke-emerald-500"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}
