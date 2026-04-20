// Supabase Edge Function: daily-rollup
// Runs nightly per user (or on-demand from the app). Reads the day's signals,
// computes adherence, writes daily_adherence_scores, updates streaks, emits
// events, and may trigger a reset-protocol prompt.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  computeDailyAdherence,
  evaluateResetTrigger,
  updateStreak,
  QUALIFYING_SCORE,
} from '../../../src/engine/index.ts';
import type { DailyLogInput, PhaseMode } from '../../../src/engine/types.ts';

interface RollupRequest {
  user_id: string;
  day: string; // 'YYYY-MM-DD'
}

Deno.serve(async (req: Request) => {
  const { user_id, day } = (await req.json()) as RollupRequest;
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // 1) Load the day's log + feeds.
  const [{ data: log }, { data: phase }] = await Promise.all([
    supabase.from('daily_logs').select('*').eq('user_id', user_id).eq('day', day).maybeSingle(),
    supabase.from('phase_states').select('mode').eq('user_id', user_id).is('ended_at', null).maybeSingle(),
  ]);
  if (!log) return new Response('no daily_log', { status: 404 });

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

  // 2) Persist score (idempotent on (user_id, day)).
  await supabase.from('daily_adherence_scores').upsert({
    user_id,
    day,
    score: result.score,
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
    .select('score').eq('user_id', user_id).lt('day', day).order('day', { ascending: false }).limit(1).maybeSingle();
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

  // 4) Reset trigger check (2–3 low-adherence days).
  const { data: recent } = await supabase.from('daily_adherence_scores')
    .select('day,score').eq('user_id', user_id).lte('day', day).order('day', { ascending: false }).limit(3);
  const trigger = evaluateResetTrigger((recent ?? []).reverse());
  if (trigger.triggered) {
    // Partial unique index: one open reset per user. Skip if an open one exists.
    const { data: openReset } = await supabase.from('reset_activations')
      .select('id').eq('user_id', user_id).is('completed_at', null).maybeSingle();
    if (!openReset) {
      await supabase.from('reset_activations').insert({
        user_id,
        triggered_on: day,
        trigger_signal: trigger,
      });
      await supabase.from('events').insert({
        user_id,
        event_type: 'reset.triggered',
        subject_day: day,
        payload: trigger,
      });
    }
  }

  // 5) Score event.
  await supabase.from('events').insert({
    user_id,
    event_type: 'daily.score_computed',
    subject_day: day,
    payload: { score: result.score, phase_mode: phaseMode },
  });

  return Response.json(result);
});
