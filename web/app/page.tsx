// Today screen — the home of Healthwize.
// Pulls only from views/tables that the engine maintains. Read-only here;
// quick-add lives in the Telegram bot for now.

import { createClient } from '@/lib/supabase/server';
import { Card, CardLabel } from '@/components/Card';
import { ScoreRing } from '@/components/ScoreRing';
import { ActionRow } from '@/components/ActionRow';
import { AdherenceBar } from '@/components/AdherenceBar';
import { Header } from '@/components/Header';
import {
  formatMinutes, formatNumber, formatPct, COMPLIANCE_LABEL,
} from '@/lib/format';

export const dynamic = 'force-dynamic';

interface TodayActions {
  day: string;
  protein_breakfast_completed: boolean;
  steps_total: number | null;
  steps_target: number | null;
  steps_target_met: boolean;
  sleep_threshold_met: boolean;
  nutrition_compliance: string | null;
  workout_scheduled: boolean;
  workout_completed: boolean;
}

interface WeekAdherence {
  week_start: string;
  adherence_pct: number | null;
  strong_days: number;
  tracked_days: number;
}

interface AlertRow {
  kind: 'plateau' | 'reset_pending' | 'adjustment_pending';
  ref_id: string;
  since: string;
}

export default async function TodayPage() {
  const supabase = createClient();

  const today = new Date();

  // RLS scopes everything to auth.uid(), so no explicit user filter needed.
  const [
    actionsRes,
    scoreRes,
    streakRes,
    weekRes,
    alertsRes,
    dailyLogRes,
  ] = await Promise.all([
    supabase.from('today_actions').select('*').maybeSingle(),
    supabase.from('daily_adherence_scores').select('score')
      .eq('day', isoDay(today)).maybeSingle(),
    supabase.from('streaks').select('current_adherence_streak,best_adherence_streak,current_comeback_streak').maybeSingle(),
    supabase.from('current_week_adherence').select('*').maybeSingle(),
    supabase.from('home_alerts').select('*').order('since', { ascending: false }),
    supabase.from('daily_logs').select('protein_breakfast_grams,sleep_minutes')
      .eq('day', isoDay(today)).maybeSingle(),
  ]);

  const actions = actionsRes.data as TodayActions | null;
  const score = scoreRes.data as { score: number | null } | null;
  const streak = streakRes.data as {
    current_adherence_streak: number;
    best_adherence_streak: number;
    current_comeback_streak: number;
  } | null;
  const weekAdherence = weekRes.data as WeekAdherence | null;
  const alerts = (alertsRes.data ?? []) as AlertRow[];
  const dailyLog = dailyLogRes.data as {
    protein_breakfast_grams: number | null;
    sleep_minutes: number | null;
  } | null;

  return (
    <>
      <Header today={today} />

      <main className="flex-1 space-y-3 px-3 pb-safe">
        {/* Hero: today's score + streak */}
        <Card className="flex items-center gap-5 py-5">
          <div className="relative">
            <ScoreRing value={score?.score ?? null} />
            <div className="absolute inset-0 flex items-center justify-center text-[15px] font-semibold tabular-nums">
              {score?.score != null ? Math.round(score.score) : '—'}
            </div>
          </div>
          <div className="flex flex-1 flex-col">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">Today's score</span>
            <span className="mt-1 text-[15px] text-zinc-900 dark:text-zinc-100">
              {streak?.current_adherence_streak
                ? `${streak.current_adherence_streak}-day streak`
                : 'No active streak'}
            </span>
            {streak?.current_comeback_streak ? (
              <span className="text-[13px] text-zinc-500">Comeback day {streak.current_comeback_streak}</span>
            ) : null}
          </div>
        </Card>

        {/* Today's actions */}
        <Card>
          <CardLabel>Today</CardLabel>
          <div className="-my-1 divide-y divide-zinc-100 dark:divide-zinc-800">
            <ActionRow
              label="Protein anchor"
              value={
                actions?.protein_breakfast_completed
                  ? `${formatNumber(dailyLog?.protein_breakfast_grams ?? null)}g`
                  : 'Pending'
              }
              status={actions?.protein_breakfast_completed ? 'done' : 'pending'}
            />
            <ActionRow
              label="Steps"
              value={
                actions?.steps_total != null
                  ? `${formatNumber(actions.steps_total, { thousands: true })} / ${formatNumber(actions.steps_target, { thousands: true })}`
                  : '—'
              }
              status={
                actions?.steps_total == null ? 'none'
                : actions.steps_target_met ? 'done' : 'missed'
              }
            />
            <ActionRow
              label="Sleep"
              value={formatMinutes(dailyLog?.sleep_minutes)}
              status={
                dailyLog?.sleep_minutes == null ? 'none'
                : actions?.sleep_threshold_met ? 'done' : 'missed'
              }
            />
            <ActionRow
              label="Nutrition"
              value={actions?.nutrition_compliance ? COMPLIANCE_LABEL[actions.nutrition_compliance] : '—'}
              status={
                actions?.nutrition_compliance == null ? 'none'
                : actions.nutrition_compliance === 'fully_compliant' || actions.nutrition_compliance === 'mostly_compliant'
                  ? 'done' : 'missed'
              }
            />
            <ActionRow
              label="Workout"
              value={
                !actions?.workout_scheduled ? 'Not scheduled'
                : actions.workout_completed ? 'Completed' : 'Pending'
              }
              status={
                !actions?.workout_scheduled ? 'none'
                : actions.workout_completed ? 'done' : 'pending'
              }
            />
          </div>
        </Card>

        {/* This week */}
        <Card>
          <CardLabel>This week</CardLabel>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-2xl font-semibold tabular-nums tracking-tightish">
              {formatPct(weekAdherence?.adherence_pct, 0)}
            </span>
            <span className="text-[13px] text-zinc-500">
              {weekAdherence?.strong_days ?? 0} of {weekAdherence?.tracked_days ?? 0} days strong
            </span>
          </div>
          <AdherenceBar value={weekAdherence?.adherence_pct ?? 0} />
        </Card>

        {/* Alerts */}
        {alerts.length > 0 ? (
          <Card>
            <CardLabel>Alerts</CardLabel>
            <ul className="-my-1 divide-y divide-zinc-100 dark:divide-zinc-800">
              {alerts.map((a) => (
                <li key={`${a.kind}-${a.ref_id}`} className="flex items-center justify-between py-2.5">
                  <span className="text-[15px]">
                    {a.kind === 'plateau' && 'Plateau in progress'}
                    {a.kind === 'reset_pending' && 'Reset protocol available'}
                    {a.kind === 'adjustment_pending' && 'Adjustment pending review'}
                  </span>
                  <span className="text-[13px] text-zinc-500">since {a.since}</span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {/* Footer */}
        <form action="/auth/signout" method="post" className="px-1 pt-2">
          <button
            type="submit"
            className="text-[13px] text-zinc-500 underline-offset-4 hover:underline"
          >
            Sign out
          </button>
        </form>
      </main>
    </>
  );
}

function isoDay(d: Date): string {
  // YYYY-MM-DD in user's local timezone (the device).
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
