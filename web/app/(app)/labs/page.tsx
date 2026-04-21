// Labs — panel view per marker + list of past draws.
//
// This is the read-only "periodic read-out" described in the spec. Each
// marker shows latest value, reference-range position, and Δ vs prior draw.
// Grouped by panel so the page stays scannable.

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Card, CardLabel } from '@/components/Card';
import { Header } from '@/components/Header';

export const dynamic = 'force-dynamic';

interface LatestMarker {
  slug: string;
  display_name: string;
  panel: string;
  drawn_on: string;
  value: number | null;
  unit: string | null;
  flag: 'low' | 'normal' | 'high' | 'critical' | null;
  reference_low: number | null;
  reference_high: number | null;
  delta: number | null;
  previous_value: number | null;
}

interface LabDraw {
  id: string;
  drawn_on: string | null;
  lab_name: string | null;
  state: string;
  created_at: string;
  confirmed_at: string | null;
}

const PANEL_ORDER = [
  'metabolic','lipid','thyroid','hormone','inflammation',
  'liver','kidney','cbc','nutrients','advanced','other',
] as const;

const PANEL_LABEL: Record<string, string> = {
  metabolic: 'Metabolic',
  lipid: 'Lipid & cardiovascular',
  thyroid: 'Thyroid',
  hormone: 'Hormones',
  inflammation: 'Inflammation',
  liver: 'Liver',
  kidney: 'Kidney & electrolytes',
  cbc: 'Complete blood count',
  nutrients: 'Nutrients',
  advanced: 'Advanced',
  other: 'Other',
};

export default async function LabsPage() {
  const supabase = createClient();

  const [markersRes, drawsRes] = await Promise.all([
    supabase.from('latest_markers').select('*').order('panel').order('drawn_on', { ascending: false }),
    supabase.from('lab_draws').select('id,drawn_on,lab_name,state,created_at,confirmed_at')
      .order('created_at', { ascending: false }).limit(20),
  ]);
  const markers = (markersRes.data ?? []) as LatestMarker[];
  const draws = (drawsRes.data ?? []) as LabDraw[];

  const byPanel = new Map<string, LatestMarker[]>();
  for (const m of markers) {
    const arr = byPanel.get(m.panel) ?? [];
    arr.push(m);
    byPanel.set(m.panel, arr);
  }
  const panels = PANEL_ORDER.filter((p) => byPanel.has(p));

  return (
    <>
      <Header today={new Date()} />

      <main className="space-y-3 px-3 pb-6">
        {/* Upload CTA always visible */}
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <CardLabel>Bloodwork</CardLabel>
              <p className="text-[13px] text-zinc-500">
                Periodic read-out. Not used for weekly adjustments.
              </p>
            </div>
            <Link
              href="/labs/upload"
              className="rounded-xl bg-zinc-900 px-3 py-2 text-[13px] font-medium text-white dark:bg-zinc-50 dark:text-zinc-900"
            >
              Upload PDF
            </Link>
          </div>
        </Card>

        {markers.length === 0 ? (
          <Card>
            <p className="text-sm text-zinc-500">
              No lab results yet. Upload your first report to get trends and panel views.
            </p>
          </Card>
        ) : (
          panels.map((p) => (
            <Card key={p}>
              <CardLabel>{PANEL_LABEL[p]}</CardLabel>
              <ul className="-my-1 divide-y divide-zinc-100 dark:divide-zinc-800">
                {(byPanel.get(p) ?? []).map((m) => (
                  <MarkerRow key={m.slug} m={m} />
                ))}
              </ul>
            </Card>
          ))
        )}

        {draws.length > 0 && (
          <Card>
            <CardLabel>Recent draws</CardLabel>
            <ul className="-my-1 divide-y divide-zinc-100 dark:divide-zinc-800">
              {draws.map((d) => (
                <li key={d.id} className="flex items-center justify-between py-2.5">
                  <div className="flex flex-col">
                    <span className="text-[14px]">
                      {d.drawn_on ?? 'Date pending'}{d.lab_name ? ` · ${d.lab_name}` : ''}
                    </span>
                    <span className="text-[12px] text-zinc-500">{stateLabel(d.state)}</span>
                  </div>
                  <DrawLink draw={d} />
                </li>
              ))}
            </ul>
          </Card>
        )}
      </main>
    </>
  );
}

function MarkerRow({ m }: { m: LatestMarker }) {
  const value = m.value != null ? `${m.value}${m.unit ? ' ' + m.unit : ''}` : '—';
  const pos = rangePosition(m.value, m.reference_low, m.reference_high);
  return (
    <li className="py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[14px] text-zinc-900 dark:text-zinc-100">{m.display_name}</span>
        <div className="flex items-baseline gap-2">
          <span className="text-[14px] tabular-nums">{value}</span>
          {m.delta != null && m.previous_value != null && (
            <span className="text-[11px] tabular-nums text-zinc-500">
              {m.delta > 0 ? '+' : ''}{round(m.delta, 2)}
            </span>
          )}
          <FlagDot flag={m.flag} position={pos} />
        </div>
      </div>
      {m.reference_low != null && m.reference_high != null && (
        <RangeBar low={m.reference_low} high={m.reference_high} value={m.value ?? 0} />
      )}
    </li>
  );
}

function FlagDot({ flag, position }: {
  flag: LatestMarker['flag'];
  position: 'low' | 'in' | 'high' | 'unknown';
}) {
  const cls =
    flag === 'critical' ? 'bg-rose-500' :
    flag === 'high' || flag === 'low' ? 'bg-amber-500' :
    position === 'in' ? 'bg-emerald-500' :
    'bg-zinc-300 dark:bg-zinc-600';
  return <span aria-hidden className={`h-2 w-2 rounded-full ${cls}`} />;
}

function RangeBar({ low, high, value }: { low: number; high: number; value: number }) {
  // Show the reference band; mark value position. Pad 15% on either side.
  const pad = (high - low) * 0.15;
  const axisLow = low - pad;
  const axisHigh = high + pad;
  const range = axisHigh - axisLow;
  const valuePct = Math.max(0, Math.min(100, ((value - axisLow) / range) * 100));
  const lowPct = ((low - axisLow) / range) * 100;
  const highPct = ((high - axisLow) / range) * 100;
  return (
    <div className="relative mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
      <div
        className="absolute top-0 h-full bg-emerald-500/30"
        style={{ left: `${lowPct}%`, right: `${100 - highPct}%` }}
      />
      <div
        className="absolute top-0 h-full w-0.5 bg-zinc-900 dark:bg-zinc-100"
        style={{ left: `calc(${valuePct}% - 1px)` }}
      />
    </div>
  );
}

function DrawLink({ draw }: { draw: LabDraw }) {
  if (draw.state === 'review' || draw.state === 'extracting' || draw.state === 'uploaded') {
    return (
      <Link href={`/labs/review/${draw.id}`} className="text-[13px] text-zinc-700 underline-offset-4 hover:underline dark:text-zinc-300">
        Review
      </Link>
    );
  }
  if (draw.state === 'confirmed') {
    return (
      <Link href={`/labs/${draw.id}`} className="text-[13px] text-zinc-700 underline-offset-4 hover:underline dark:text-zinc-300">
        Open
      </Link>
    );
  }
  return <span className="text-[12px] text-zinc-500">{draw.state}</span>;
}

function rangePosition(v: number | null, lo: number | null, hi: number | null): 'low' | 'in' | 'high' | 'unknown' {
  if (v == null || lo == null || hi == null) return 'unknown';
  if (v < lo) return 'low';
  if (v > hi) return 'high';
  return 'in';
}

function round(n: number, d: number): string {
  const m = Math.pow(10, d);
  return String(Math.round(n * m) / m);
}

function stateLabel(s: string): string {
  switch (s) {
    case 'uploaded': return 'Uploaded, extracting soon';
    case 'extracting': return 'Extracting…';
    case 'review': return 'Ready for review';
    case 'confirmed': return 'Confirmed';
    case 'failed': return 'Extraction failed';
    default: return s;
  }
}
