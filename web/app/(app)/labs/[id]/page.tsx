// Confirmed-draw detail view. Shows every marker from this single draw,
// grouped by panel, with Δ vs. the previous draw for each.

import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Card, CardLabel } from '@/components/Card';
import { Header } from '@/components/Header';
import { deleteLabDraw } from '../actions';

export const dynamic = 'force-dynamic';

interface DrawRow {
  id: string;
  drawn_on: string | null;
  lab_name: string | null;
  state: string;
  extraction_model: string | null;
}

interface DrawMarker {
  canonical_marker_id: number | null;
  raw_marker_text: string | null;
  marker: string;
  value: number | null;
  unit: string | null;
  flag: string | null;
  reference_low: number | null;
  reference_high: number | null;
  canonical: {
    slug: string;
    display_name: string;
    panel: string;
    sort_order: number;
  } | null;
}

const PANEL_ORDER = ['metabolic','lipid','thyroid','hormone','inflammation','liver','kidney','cbc','nutrients','advanced','other'] as const;

export default async function DrawDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data: drawRow } = await supabase.from('lab_draws')
    .select('id,drawn_on,lab_name,state,extraction_model').eq('id', params.id).maybeSingle();
  if (!drawRow) notFound();
  const draw = drawRow as DrawRow;

  const { data: rowsRes } = await supabase.from('bloodwork_results')
    .select(`
      canonical_marker_id, raw_marker_text, marker, value, unit, flag,
      reference_low, reference_high,
      canonical:canonical_markers(slug,display_name,panel,sort_order)
    `)
    .eq('draw_id', params.id);
  const rows = (rowsRes ?? []) as unknown as DrawMarker[];

  // Previous values for delta computation (one lookup keyed by canonical_marker_id).
  const canonicalIds = rows.map((r) => r.canonical_marker_id).filter((x): x is number => x != null);
  let priors = new Map<number, number>();
  if (canonicalIds.length && draw.drawn_on) {
    const { data: prev } = await supabase.from('bloodwork_results')
      .select('canonical_marker_id,value,drawn_on')
      .in('canonical_marker_id', canonicalIds)
      .lt('drawn_on', draw.drawn_on)
      .order('drawn_on', { ascending: false });
    for (const p of prev ?? []) {
      if (p.canonical_marker_id != null && p.value != null && !priors.has(p.canonical_marker_id)) {
        priors.set(p.canonical_marker_id, Number(p.value));
      }
    }
  }

  const byPanel = new Map<string, DrawMarker[]>();
  for (const r of rows) {
    const panel = r.canonical?.panel ?? 'other';
    const arr = byPanel.get(panel) ?? [];
    arr.push(r);
    byPanel.set(panel, arr);
  }
  for (const arr of byPanel.values()) {
    arr.sort((a, b) => (a.canonical?.sort_order ?? 999) - (b.canonical?.sort_order ?? 999));
  }
  const panels = PANEL_ORDER.filter((p) => byPanel.has(p));

  return (
    <>
      <Header today={new Date()} />

      <main className="space-y-3 px-3 pb-6">
        <Card>
          <div className="flex items-baseline justify-between">
            <div>
              <CardLabel>Lab draw</CardLabel>
              <p className="text-[15px]">
                {draw.drawn_on ?? 'Date unknown'}{draw.lab_name ? ` · ${draw.lab_name}` : ''}
              </p>
              <p className="text-[12px] text-zinc-500">
                {rows.length} markers · extracted by {draw.extraction_model ?? 'claude'}
              </p>
            </div>
          </div>
        </Card>

        {panels.map((p) => (
          <Card key={p}>
            <CardLabel>{labelFor(p)}</CardLabel>
            <ul className="-my-1 divide-y divide-zinc-100 dark:divide-zinc-800">
              {(byPanel.get(p) ?? []).map((m, i) => (
                <Row key={`${p}-${i}`} m={m} prior={m.canonical_marker_id != null ? priors.get(m.canonical_marker_id) : null} />
              ))}
            </ul>
          </Card>
        ))}

        <form action={deleteLabDraw}>
          <input type="hidden" name="draw_id" value={draw.id} />
          <button
            type="submit"
            className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-[13px] font-medium text-zinc-500 dark:border-zinc-800"
          >
            Delete this draw & its PDF
          </button>
        </form>
      </main>
    </>
  );
}

function Row({ m, prior }: { m: DrawMarker; prior: number | null | undefined }) {
  const name = m.canonical?.display_name ?? m.marker;
  const delta = prior != null && m.value != null ? m.value - prior : null;
  const pos = rangePosition(m.value, m.reference_low, m.reference_high);
  return (
    <li className="py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[14px] text-zinc-900 dark:text-zinc-100">{name}</span>
        <div className="flex items-baseline gap-2">
          <span className="text-[14px] tabular-nums">
            {m.value != null ? m.value : '—'}{m.unit ? ' ' + m.unit : ''}
          </span>
          {delta != null && (
            <span className="text-[11px] tabular-nums text-zinc-500">
              {delta > 0 ? '+' : ''}{round(delta, 2)}
            </span>
          )}
          <FlagDot flag={m.flag} position={pos} />
        </div>
      </div>
      {m.reference_low != null && m.reference_high != null && m.value != null && (
        <RangeBar low={m.reference_low} high={m.reference_high} value={m.value} />
      )}
    </li>
  );
}

function FlagDot({ flag, position }: { flag: string | null; position: 'low' | 'in' | 'high' | 'unknown' }) {
  const cls =
    flag === 'critical' ? 'bg-rose-500' :
    flag === 'high' || flag === 'low' ? 'bg-amber-500' :
    position === 'in' ? 'bg-emerald-500' :
    'bg-zinc-300 dark:bg-zinc-600';
  return <span aria-hidden className={`h-2 w-2 rounded-full ${cls}`} />;
}

function RangeBar({ low, high, value }: { low: number; high: number; value: number }) {
  const pad = (high - low) * 0.15;
  const axisLow = low - pad;
  const axisHigh = high + pad;
  const range = axisHigh - axisLow;
  const valuePct = Math.max(0, Math.min(100, ((value - axisLow) / range) * 100));
  const lowPct = ((low - axisLow) / range) * 100;
  const highPct = ((high - axisLow) / range) * 100;
  return (
    <div className="relative mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
      <div className="absolute top-0 h-full bg-emerald-500/30" style={{ left: `${lowPct}%`, right: `${100 - highPct}%` }} />
      <div className="absolute top-0 h-full w-0.5 bg-zinc-900 dark:bg-zinc-100" style={{ left: `calc(${valuePct}% - 1px)` }} />
    </div>
  );
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

function labelFor(p: string): string {
  return {
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
  }[p] ?? p;
}
