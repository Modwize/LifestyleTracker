// daily-rollup
// Computes the day's adherence score, updates streaks, detects reset triggers,
// and schedules tomorrow's notifications. Idempotent per (user_id, day).
//
// Can be invoked:
//  - by pg_cron with empty body (runs for the primary user, yesterday's date)
//  - by the app with { user_id, day } to force a recompute

import {
  computeDailyAdherence,
  evaluateResetTrigger,
  updateStreak,
  QUALIFYING_SCORE,
} from '../../../src/engine/index.ts';
import type { DailyLogInput, PhaseMode } from '../../../src/engine/types.ts';
import { serviceClient, primaryUser, todayISO, addDays } from '../_shared/db.ts';
import { scheduleNotificationsForDay } from '../_shared/notifications.ts';

Deno.serve(async (req) => {
  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
  const supabase = serviceClient();

  const user = await primaryUser(supabase);
  const user_id: string = body.user_id ?? user.id;
  // Default: compute yesterday (the day that just completed in the user's TZ).
  const today = todayISO(user.timezone);
  const day: string = body.day ?? addDays(today, -1);

  // 1) Load the day's log + phase.
  const [{ data: log }, { data: phase }] = await Promise.all([
    supabase.from('daily_logs').select('*').eq('user_id', user_id).eq('day', day).maybeSingle(),
    supabase.from('phase_states').select('mode')
      .eq('user_id', user_id).is('ended_at', null).maybeSingle(),
  ]);
  if (!log) {
    // No explicit log row — skip score but still schedule tomorrow's notifications.
    await scheduleTomorrow(supabase, user_id, today);
    return Response.json({ skipped: 'no_daily_log', day });
  }

  const phaseMode = (phase?.mode ?? 'normal') as PhaseMode;

  const input: DailyLogInput = {
    day,
    proteinBreakfastCompleted: log.protein_breakfast_completed,
    proteinBreakfastGrams: log.protein_breakfast_grams,
    proteinBreakfastMinutesAfterWake: log.protein_breakfast_minutes_after_wake,
    stepsTotal: log.steps_total,
    stepsTarget: log.steps_target,
    sleepMinutes: log.sleep_minutes,
    sleepThresholdMinutes: log.sleep_threshold_minutes,
    nutritionCompliance: log.nutrition_compliance,
    workoutScheduled: log.workout_scheduled,
    workoutCompleted: log.workout_completed,
    cheatDay: log.cheat_day,
  };

  const result = computeDailyAdherence(input, phaseMode);

  // 2) Persist score.
  await supabase.from('daily_adherence_scores').upsert({
    user_id, day, score: result.score,
    nutrition_component: result.components.nutrition,
    protein_component: result.components.protein,
    steps_component: result.components.steps,
    sleep_component: result.components.sleep,
    workout_component: result.components.workout,
    nutrition_weight: result.weights.nutrition,
    protein_weight: result.weights.protein,
    steps_weight: result.weights.steps,
    sleep_weight: result.weights.sleep,
    workout_weight: result.weights.workout,
    phase_mode: phaseMode,
  });

  // 3) Streaks + comeback.
  const { data: prevStreak } = await supabase.from('streaks')
    .select('*').eq('user_id', user_id).maybeSingle();
  const { data: priorScore } = await supabase.from('daily_adherence_scores')
    .select('score').eq('user_id', user_id).lt('day', day)
    .order('day', { ascending: false }).limit(1).maybeSingle();
  const next = updateStreak(
    prevStreak?.current_adherence_streak ?? 0,
    prevStreak?.current_comeback_streak ?? 0,
    result.score,
    (priorScore?.score ?? 0) >= QUALIFYING_SCORE,
  );
  await supabase.from('streaks').upsert({
    user_id,
    current_adherence_streak: next.adherenceStreak,
    best_adherence_streak: Math.max(next.adherenceStreak, prevStreak?.best_adherence_streak ?? 0),
    current_comeback_streak: next.comebackStreak,
    last_qualifying_day: result.score >= QUALIFYING_SCORE ? day : prevStreak?.last_qualifying_day,
  });

  // 4) Reset trigger.
  const { data: recent } = await supabase.from('daily_adherence_scores')
    .select('day,score').eq('user_id', user_id).lte('day', day)
    .order('day', { ascending: false }).limit(3);
  const trigger = evaluateResetTrigger((recent ?? []).reverse());
  if (trigger.triggered) {
    const { data: openReset } = await supabase.from('reset_activations')
      .select('id').eq('user_id', user_id).is('completed_at', null).maybeSingle();
    if (!openReset) {
      await supabase.from('reset_activations').insert({
        user_id, triggered_on: day, trigger_signal: trigger,
      });
      await supabase.from('events').insert({
        user_id, event_type: 'reset.triggered', subject_day: day, payload: trigger,
      });
    }
  }

  // 5) Score event.
  await supabase.from('events').insert({
    user_id, event_type: 'daily.score_computed',
    subject_day: day, payload: { score: result.score, phase_mode: phaseMode },
  });

  // 6) Schedule tomorrow's notifications.
  const scheduled = await scheduleTomorrow(supabase, user_id, today);

  return Response.json({ result, scheduled });
});

async function scheduleTomorrow(supabase: any, user_id: string, today: string): Promise<number> {
  const { data: u } = await supabase.from('users')
    .select('timezone,wake_window_start,check_in_weekday').eq('id', user_id).single();
  const tomorrow = addDays(today, 1);
  const jsDow = new Date(tomorrow + 'T00:00:00Z').getUTCDay();

  // Open-state flags for conditional notifications.
  const [{ data: openReset }, { data: pendingAdj }] = await Promise.all([
    supabase.from('reset_activations').select('id')
      .eq('user_id', user_id).is('acknowledged_at', null).maybeSingle(),
    supabase.from('adjustments').select('id')
      .eq('user_id', user_id).eq('decision', 'pending').maybeSingle(),
  ]);

  return await scheduleNotificationsForDay(
    supabase, user_id, tomorrow,
    u.timezone, u.wake_window_start,
    jsDow === u.check_in_weekday,
    {
      hasPendingAdjustment: !!pendingAdj,
      hasOpenReset: !!openReset,
      hasRegressionAlert: false,
      hasPatternAlert: false,
      isAdherenceLowMidday: false,
      maxPerDay: 10,
    },
  );
}
