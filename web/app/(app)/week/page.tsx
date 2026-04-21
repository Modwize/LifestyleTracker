// Week screen — Friday review + trends + pending adjustment.

import { createClient } from '@/lib/supabase/server';
import { Card, CardLabel } from '@/components/Card';
import { Stat } from '@/components/Stat';
import { Sparkline } from '@/components/Sparkline';
import { Header } from '@/components/Header';
import { decideAdjustment } from './actions';
import { formatMinutes, formatPct } from '@/lib/format';

export const dynamic = 'force-dynamic';

interface WeeklyReview {
  id: string;
  week_start_date: string;
  adherence_pct: number | null;
  waist_change_inches: number | null;
  weight_change_lbs: number | null;
  sleep_minutes_avg: number | null;
  step_consistency_pct: number | null;
  nutrition_compliance_ratio: number | null;
  alcohol_drinks_total: number | null;
  status: string;
  summary_md: string | null;
}

interface Adjustment {
  id: string;
  action: string;
  trigger_signal: Record<string, unknown>;
  supporting_data: Record<string, unknown>;
  reason: string;
  expected_outcome: string;
  created_at: string;
}

export default async function WeekPage() {
  const supabase = createClient();

  const [reviewsRes, waistRes, weightRes, pendingRes, groceriesRes] = await Promise.all([
    supabase.from('weekly_reviews').select('*').order('week_start_date', { ascending: false }).limit(8),
    supabase.from('waist_measurements').select('measured_on,average_inches')
      .order('measured_on', { ascending: true }).limit(12),
    supabase.from('weight_measurements').select('measured_on,weight_lbs')
      .order('measured_on', { ascending: false }).limit(30),
    supabase.from('adjustments').select('id,action,trigger_signal,supporting_data,reason,expected_outcome,created_at')
      .eq('decision', 'pending').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('grocery_suggestions').select('category,item,rationale,week_start_date')
      .order('week_start_date', { ascending: false }).limit(20),
  ]);

  const reviews = (reviewsRes.data ?? []) as WeeklyReview[];
  const current = reviews[0];
  const waist = (waistRes.data ?? []) as Array<{ measured_on: string; average_inches: number }>;
  const weightRows = (weightRes.data ?? []) as Array<{ measured_on: string; weight_lbs: number }>;
  const weights = [...weightRows].reverse();
  const pending = pendingRes.data as Adjustment | null;

  const groceries = (groceriesRes.data ?? []) as Array<{
    category: 'protein' | 'vegetable' | 'legume' | 'hydration' | 'recovery_food';
    item: string;
    rationale: string;
    week_start_date: string;
  }>;
  // Most recent week's list only — older rows stay in the DB for audit but
  // the card should never mix weeks.
  const currentGroceryWeek = groceries[0]?.week_start_date ?? null;
  const currentGroceries = currentGroceryWeek
    ? groceries.filter((g) => g.week_start_date === currentGroceryWeek)
    : [];

  const waistSpark = waist.map((w) => ({ x: +new Date(w.measured_on), y: Number(w.average_inches) }));
  const weightSpark = weights.map((w) => ({ x: +new Date(w.measured_on), y: Number(w.weight_lbs) }));

  return (
    <>
      <Header today={new Date()} />

      <main className="space-y-3 px-3 pb-6">
        {/* Hero: latest review summary */}
        <Card>
          <div className="mb-3 flex items-baseline justify-between">
            <CardLabel>Week{current ? ` of ${current.week_start_date}` : ''}</CardLabel>
            {current && <StatusPill status={current.status} />}
          </div>
          {current ? (
            <div className="grid grid-cols-2 gap-y-4">
              <Stat label="Adherence" value={formatPct(current.adherence_pct, 0)} />
              <Stat
                label="Waist Δ"
                value={current.waist_change_inches != null
                  ? `${signed(current.waist_change_inches)} in` : '—'}
              />
              <Stat
                label="Weight Δ"
                value={current.weight_change_lbs != null
                  ? `${signed(current.weight_change_lbs)} lbs` : '—'}
              />
              <Stat label="Sleep avg" value={formatMinutes(current.sleep_minutes_avg)} />
              <Stat label="Step consistency" value={formatPct(current.step_consistency_pct, 0)} />
              <Stat
                label="Nutrition"
                value={current.nutrition_compliance_ratio != null
                  ? formatPct(current.nutrition_compliance_ratio * 100, 0) : '—'}
              />
              <Stat
                label="Alcohol"
                value={`${current.alcohol_drinks_total ?? 0} drinks`}
              />
            </div>
          ) : (
            <p className="text-sm text-zinc-500">No weekly review yet. It runs Friday morning.</p>
          )}
        </Card>

        {/* Waist trend */}
        <Card>
          <CardLabel>Waist — last {waist.length} measurements</CardLabel>
          {waist.length >= 1 && (
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-2xl font-semibold tabular-nums tracking-tightish">
                {Number(waist[waist.length - 1].average_inches).toFixed(2)} in
              </span>
              {waist.length >= 2 && (
                <span className="text-[12px] text-zinc-500">
                  {signed(
                    Number(waist[waist.length - 1].average_inches) -
                    Number(waist[0].average_inches),
                  )} in over {waist.length} readings
                </span>
              )}
            </div>
          )}
          <Sparkline data={waistSpark} />
        </Card>

        {/* Weight trend */}
        <Card>
          <CardLabel>Weight — last {weights.length} days</CardLabel>
          {weights.length >= 1 && (
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-2xl font-semibold tabular-nums tracking-tightish">
                {Number(weights[weights.length - 1].weight_lbs).toFixed(1)} lbs
              </span>
              {weights.length >= 2 && (
                <span className="text-[12px] text-zinc-500">
                  {signed(
                    Number(weights[weights.length - 1].weight_lbs) -
                    Number(weights[0].weight_lbs),
                  )} lbs
                </span>
              )}
            </div>
          )}
          <Sparkline data={weightSpark} />
        </Card>

        {/* Pending adjustment with full provenance */}
        {pending && (
          <Card>
            <CardLabel>Pending adjustment</CardLabel>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[15px] font-medium">{humanAction(pending.action)}</span>
              <span className="text-[12px] text-zinc-500">
                {new Date(pending.created_at).toLocaleDateString()}
              </span>
            </div>
            <p className="mb-1 text-[14px] text-zinc-700 dark:text-zinc-300">{pending.reason}</p>
            <p className="mb-4 text-[13px] text-zinc-500">{pending.expected_outcome}</p>
            <ProvenanceBlock
              trigger={pending.trigger_signal}
              supporting={pending.supporting_data}
            />
            <div className="mt-4 grid grid-cols-2 gap-2">
              <form action={decideAdjustment}>
                <input type="hidden" name="id" value={pending.id} />
                <input type="hidden" name="decision" value="accepted" />
                <button
                  type="submit"
                  className="w-full rounded-xl bg-zinc-900 px-4 py-2.5 text-[14px] font-medium text-white transition hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  Accept
                </button>
              </form>
              <form action={decideAdjustment}>
                <input type="hidden" name="id" value={pending.id} />
                <input type="hidden" name="decision" value="rejected" />
                <button
                  type="submit"
                  className="w-full rounded-xl border border-zinc-300 bg-transparent px-4 py-2.5 text-[14px] font-medium transition hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-500"
                >
                  Reject
                </button>
              </form>
            </div>
          </Card>
        )}

        {/* Groceries for next week */}
        {currentGroceries.length > 0 && (
          <Card>
            <div className="mb-3 flex items-baseline justify-between">
              <CardLabel>Groceries for week of {currentGroceryWeek}</CardLabel>
              <span className="text-[11px] text-zinc-500">based on signals</span>
            </div>
            <ul className="-my-1 divide-y divide-zinc-100 dark:divide-zinc-800">
              {currentGroceries.map((g, i) => (
                <li key={`${g.category}-${g.item}-${i}`} className="py-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[14px]">{g.item}</span>
                    <span className="text-[10px] uppercase tracking-wider text-zinc-500">
                      {g.category.replace(/_/g, ' ')}
                    </span>
                  </div>
                  {g.rationale && (
                    <p className="mt-0.5 text-[12px] text-zinc-500">{g.rationale}</p>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* History */}
        {reviews.length > 1 && (
          <Card>
            <CardLabel>History</CardLabel>
            <ul className="-my-1 divide-y divide-zinc-100 dark:divide-zinc-800">
              {reviews.slice(1).map((r) => (
                <li key={r.id} className="flex items-center justify-between py-2.5">
                  <div className="flex flex-col">
                    <span className="text-[14px]">{r.week_start_date}</span>
                    <span className="text-[12px] text-zinc-500">{r.status}</span>
                  </div>
                  <span className="text-[14px] tabular-nums">{formatPct(r.adherence_pct, 0)}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </main>
    </>
  );
}

function signed(n: number): string {
  const v = Math.round(n * 100) / 100;
  return (v > 0 ? '+' : '') + v;
}

function humanAction(a: string): string {
  return a.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === 'on_track' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' :
    status === 'regression' ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300' :
    'border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300';
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium tracking-tight ${tone}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function ProvenanceBlock({
  trigger, supporting,
}: { trigger: Record<string, unknown>; supporting: Record<string, unknown> }) {
  return (
    <div className="mt-1 space-y-1 rounded-xl bg-zinc-50 p-3 text-[12px] dark:bg-zinc-950/70">
      <ProvenanceRow label="Trigger" data={trigger} />
      <ProvenanceRow label="Supporting" data={supporting} />
    </div>
  );
}

function ProvenanceRow({ label, data }: { label: string; data: Record<string, unknown> }) {
  const entries = Object.entries(data ?? {});
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-0.5">
      <span className="text-zinc-500">{label}:</span>
      {entries.map(([k, v]) => (
        <span key={k} className="tabular-nums text-zinc-700 dark:text-zinc-300">
          {k}={String(v)}
        </span>
      ))}
    </div>
  );
}
