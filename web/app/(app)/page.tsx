// Today screen — the home of Healthwize.

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Card, CardLabel } from '@/components/Card';
import { ScoreRing } from '@/components/ScoreRing';
import { ActionRow } from '@/components/ActionRow';
import { AdherenceBar } from '@/components/AdherenceBar';
import { Header } from '@/components/Header';
import {
  formatMinutes, formatNumber, formatPct, COMPLIANCE_LABEL,
} from '@/lib/format';
import {
  acknowledgeReset, decidePhaseTransition, scheduleSurgery,
} from './actions';

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

interface OpenReset { id: string; triggered_on: string }
interface PendingPhaseRequest {
  id: string;
  from_mode: string;
  to_mode: string;
  reason: string;
  expected_outcome: string | null;
  created_at: string;
}
interface PendingAdjustment {
  id: string; action: string; reason: string; created_at: string;
}

export default async function TodayPage() {
  const supabase = createClient();
  const today = new Date();

  const [
    actionsRes, scoreRes, streakRes, weekRes, dailyLogRes,
    phaseRes, openResetRes, pendingPhaseReqRes, pendingAdjRes, surgeryLifeRes,
    milestonesRes,
  ] = await Promise.all([
    supabase.from('today_actions').select('*').maybeSingle(),
    supabase.from('daily_adherence_scores').select('score').eq('day', isoDay(today)).maybeSingle(),
    supabase.from('streaks').select('current_adherence_streak,best_adherence_streak,current_comeback_streak').maybeSingle(),
    supabase.from('current_week_adherence').select('*').maybeSingle(),
    supabase.from('daily_logs').select('protein_breakfast_grams,sleep_minutes').eq('day', isoDay(today)).maybeSingle(),
    supabase.from('phase_states').select('mode').is('ended_at', null).maybeSingle(),
    supabase.from('reset_activations').select('id,triggered_on').is('acknowledged_at', null).maybeSingle(),
    supabase.from('phase_transition_requests')
      .select('id,from_mode,to_mode,reason,expected_outcome,created_at')
      .eq('decision', 'pending').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('adjustments').select('id,action,reason,created_at')
      .eq('decision', 'pending').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('life_events').select('event_date')
      .eq('kind', 'surgery_scheduled').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('milestones').select('kind,achieved_on,payload')
      .order('achieved_on', { ascending: false }).limit(5),
  ]);

  const actions = actionsRes.data as TodayActions | null;
  const score = scoreRes.data as { score: number | null } | null;
  const streak = streakRes.data as {
    current_adherence_streak: number;
    best_adherence_streak: number;
    current_comeback_streak: number;
  } | null;
  const weekAdherence = weekRes.data as WeekAdherence | null;
  const dailyLog = dailyLogRes.data as {
    protein_breakfast_grams: number | null;
    sleep_minutes: number | null;
  } | null;
  const phaseMode = (phaseRes.data as { mode: string } | null)?.mode ?? 'normal';
  const openReset = openResetRes.data as OpenReset | null;
  const pendingPhase = pendingPhaseReqRes.data as PendingPhaseRequest | null;
  const pendingAdj = pendingAdjRes.data as PendingAdjustment | null;
  const surgeryScheduled = surgeryLifeRes.data as { event_date: string } | null;
  const milestones = (milestonesRes.data ?? []) as Array<{
    kind: string; achieved_on: string; payload: Record<string, unknown> | null;
  }>;

  const hasPending = !!(openReset || pendingPhase || pendingAdj);
  const needsSurgeryDate = phaseMode === 'pre_surgery' && !surgeryScheduled;

  return (
    <>
      <Header today={today} phaseMode={phaseMode} />

      <main className="flex-1 space-y-3 px-3 pb-safe">
        {/* Hero: score + streak */}
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

        {/* Pending actions — only renders when something needs a decision */}
        {hasPending && (
          <Card>
            <CardLabel>Pending actions</CardLabel>
            <div className="-my-1 divide-y divide-zinc-100 dark:divide-zinc-800">
              {openReset && (
                <PendingBlock
                  title="Reset protocol available"
                  subtitle={`Triggered ${openReset.triggered_on}. Protein + hydration + simplified meals + sleep priority for 48h.`}
                >
                  <form action={acknowledgeReset}>
                    <PrimaryButton>Acknowledge</PrimaryButton>
                  </form>
                </PendingBlock>
              )}

              {pendingPhase && (
                <PendingBlock
                  title={`Phase transition: ${pendingPhase.from_mode.replace(/_/g, ' ')} → ${pendingPhase.to_mode.replace(/_/g, ' ')}`}
                  subtitle={pendingPhase.reason}
                  footer={pendingPhase.expected_outcome}
                >
                  <div className="grid grid-cols-2 gap-2">
                    <form action={decidePhaseTransition}>
                      <input type="hidden" name="id" value={pendingPhase.id} />
                      <input type="hidden" name="decision" value="approved" />
                      <PrimaryButton>Approve</PrimaryButton>
                    </form>
                    <form action={decidePhaseTransition}>
                      <input type="hidden" name="id" value={pendingPhase.id} />
                      <input type="hidden" name="decision" value="rejected" />
                      <SecondaryButton>Reject</SecondaryButton>
                    </form>
                  </div>
                </PendingBlock>
              )}

              {pendingAdj && (
                <PendingBlock
                  title={`Adjustment: ${pendingAdj.action.replace(/_/g, ' ')}`}
                  subtitle={pendingAdj.reason}
                >
                  <Link
                    href="/week"
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-200 px-4 text-[14px] font-medium dark:border-zinc-800"
                  >
                    Review on Week
                  </Link>
                </PendingBlock>
              )}
            </div>
          </Card>
        )}

        {/* Surgery-date setter — only in pre_surgery with no scheduled date */}
        {needsSurgeryDate && (
          <Card>
            <CardLabel>Surgery date</CardLabel>
            <p className="mb-3 text-[13px] text-zinc-500">
              You're in pre-surgery mode but no date is set. Recording a date queues a
              pre→post transition request that surfaces here on the day.
            </p>
            <form action={scheduleSurgery} className="grid grid-cols-[1fr_auto] gap-2">
              <input
                required type="date" name="surgery_date"
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-[15px] dark:border-zinc-800 dark:bg-zinc-900"
              />
              <PrimaryButton>Save</PrimaryButton>
            </form>
          </Card>
        )}

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

        {/* Milestones — only shown when the user has earned something */}
        {milestones.length > 0 && (
          <Card>
            <CardLabel>Milestones</CardLabel>
            <ul className="-my-1 divide-y divide-zinc-100 dark:divide-zinc-800">
              {milestones.map((m) => (
                <li key={m.kind} className="flex items-center justify-between py-2.5">
                  <span className="text-[14px]">{milestoneLabel(m.kind, m.payload)}</span>
                  <span className="text-[12px] tabular-nums text-zinc-500">{m.achieved_on}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}

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

function PendingBlock({ title, subtitle, footer, children }: {
  title: string;
  subtitle?: string;
  footer?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2 py-3">
      <div className="space-y-0.5">
        <p className="text-[14px] font-medium text-zinc-900 dark:text-zinc-100">{title}</p>
        {subtitle && <p className="text-[13px] text-zinc-600 dark:text-zinc-400">{subtitle}</p>}
        {footer && <p className="text-[12px] text-zinc-500">{footer}</p>}
      </div>
      {children}
    </div>
  );
}

function PrimaryButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="submit"
      className="h-10 w-full rounded-xl bg-zinc-900 px-4 text-[14px] font-medium text-white transition hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
    >
      {children}
    </button>
  );
}

function SecondaryButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="submit"
      className="h-10 w-full rounded-xl border border-zinc-300 bg-transparent px-4 text-[14px] font-medium transition hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-500"
    >
      {children}
    </button>
  );
}

function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function milestoneLabel(kind: string, payload: Record<string, unknown> | null): string {
  switch (kind) {
    case 'streak_7':     return '7-day streak';
    case 'streak_30':    return '30-day streak';
    case 'streak_100':   return '100-day streak';
    case 'comeback_7':   return '7-day comeback';
    case 'weekly_80':    return 'First ≥80% week';
    case 'waist_phase_1': {
      const w = payload?.waist_inches as number | undefined;
      return `Waist Phase 1 hit${w ? ` (${w} in)` : ''}`;
    }
    case 'waist_phase_2': return 'Waist Phase 2 hit';
    case 'waist_phase_3': return 'Waist Phase 3 hit';
    case 'waist_optimal': return 'Waist optimal zone';
    case 'first_lab':    return 'First lab uploaded';
    default:             return kind.replace(/_/g, ' ');
  }
}
