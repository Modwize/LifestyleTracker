// Sparkline. No axis labels, no grid. Just the shape of the trend.
// Pass an array of {x, y}. We normalise to the viewbox internally.

export function Sparkline({
  data,
  width = 320,
  height = 64,
  strokeWidth = 2,
}: {
  data: Array<{ x: number; y: number }>;
  width?: number;
  height?: number;
  strokeWidth?: number;
}) {
  if (data.length < 2) {
    return (
      <div className="flex h-16 items-center justify-center text-[12px] text-zinc-500">
        Not enough data
      </div>
    );
  }
  const xs = data.map((d) => d.x);
  const ys = data.map((d) => d.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;
  const pad = 4;

  const path = data
    .map((d, i) => {
      const px = pad + ((d.x - xMin) / xRange) * (width - pad * 2);
      const py = height - pad - ((d.y - yMin) / yRange) * (height - pad * 2);
      return `${i === 0 ? 'M' : 'L'} ${px.toFixed(2)} ${py.toFixed(2)}`;
    })
    .join(' ');

  const last = data[data.length - 1];
  const lastX = pad + ((last.x - xMin) / xRange) * (width - pad * 2);
  const lastY = height - pad - ((last.y - yMin) / yRange) * (height - pad * 2);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%" height={height}
      preserveAspectRatio="none" aria-hidden
    >
      <path d={path} fill="none"
        className="stroke-zinc-900 dark:stroke-zinc-100"
        strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r={strokeWidth + 1}
        className="fill-emerald-500" />
    </svg>
  );
}
