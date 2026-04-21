// Tiny presentation helpers. Intentionally no toast / shadcn-style framework —
// minimal surface area until we know what we actually need.

export function formatMinutes(min: number | null | undefined): string {
  if (min == null) return '—';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h}h ${m.toString().padStart(2, '0')}m`;
}

export function formatNumber(n: number | null | undefined, opts: { thousands?: boolean } = {}): string {
  if (n == null) return '—';
  if (opts.thousands && n >= 1000) return n.toLocaleString('en-US');
  return String(n);
}

export function formatDateLong(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

export function formatPct(n: number | null | undefined, decimals = 0): string {
  if (n == null) return '—';
  return `${n.toFixed(decimals)}%`;
}

// Compliance state → human label. Keeps UI strings out of switches.
export const COMPLIANCE_LABEL: Record<string, string> = {
  fully_compliant: 'Fully compliant',
  mostly_compliant: 'Mostly compliant',
  off_plan_recovered: 'Recovered',
  off_plan: 'Off plan',
};
