// Supabase Edge Function: weekly-review
// Fires Friday morning. Rolls the week up, classifies status, proposes an
// adjustment with full provenance, persists everything, emits events.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  runWeeklyReview,
  selectAdjustment,
  classifyAlcoholWeek,
} from '../../../src/engine/index.ts';

interface Request { user_id: string; week_start_date: string; }

Deno.serve(async (req) => {
  const { user_id, week_start_date } = (await req.json()) as Request;
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const weekEnd = addDays(week_start_date, 6);

  // Pull the week's signals in one round of parallel reads.
  const [scores, sleeps, steps, nutrition, readiness, alcohol, waists, weights, plateau] =
    await Promise.all([
      supabase.from('daily_adherence_scores').select('day,score')
        .eq('user_id', user_id).gte('day', week_start_date).lte('day', weekEnd),
      supabase.from('sleep_records').select('day,total_sleep_minutes')
        .eq('user_id', user_id).gte('day', week_start_date).lte('day', weekEnd),
      supabase.from('daily_logs').select('day,steps_total,steps_target')
        .eq('user_id', user_id).gte('day', week_start_date).lte('day', weekEnd),
      supabase.from('nutrition_days').select('day,compliance')
        .eq('user_id', user_id).gte('day', week_start_date).lte('day', weekEnd),
      supabase.from('oura_readiness').select('day,readiness_score')
        .eq('user_id', user_id).gte('day', week_start_date).lte('day', weekEnd),
      supabase.from('alcohol_entries').select('day,drinks')
        .eq('user_id', user_id).gte('day', week_start_date).lte('day', weekEnd),
      supabase.from('waist_measurements').select('measured_on,average_inches')
        .eq('user_id', user_id).lte('measured_on', weekEnd).order('measured_on', { ascending: false }).limit(2),
      supabase.from('weight_measurements').select('measured_on,weight_lbs')
        .eq('user_id', user_id).lte('measured_on', weekEnd).order('measured_on', { ascending: false }).limit(2),
      supabase.from('plateau_states').select('weeks_in_plateau')
        .eq('user_id', user_id).is('resolved_on', null).maybeSingle(),
    ]);

  const drinksTotal = (alcohol.data ?? []).reduce((s, r) => s + Number(r.drinks ?? 0), 0);

  const review = runWeeklyReview({
    weekStartDate: week_start_date,
    dailyScores: (scores.data ?? []).map((r) => ({ day: r.day, score: Number(r.score) })),
    waist: {
      previous: waists.data?.[1]?.average_inches ?? null,
      current: waists.data?.[0]?.average_inches ?? null,
    },
    weight: {
      previous: weights.data?.[1]?.weight_lbs ?? null,
      current: weights.data?.[0]?.weight_lbs ?? null,
    },
    sleepMinutesByDay: (sleeps.data ?? []).map((r) => ({ day: r.day, minutes: r.total_sleep_minutes })),
    stepsByDay: (steps.data ?? []).map((r) => ({ day: r.day, steps: r.steps_total ?? 0, target: r.steps_target ?? 0 })),
    nutritionByDay: (nutrition.data ?? []).map((r) => ({ day: r.day, compliance: r.compliance })),
    alcoholDrinksTotal: drinksTotal,
    readinessByDay: (readiness.data ?? []).map((r) => ({ day: r.day, readiness: r.readiness_score })),
    plateauWeeks: plateau.data?.weeks_in_plateau ?? 0,
  });

  // Persist the review + classify alcohol.
  const { data: insertedReview } = await supabase.from('weekly_reviews').upsert({
    user_id, week_start_date: review.weekStartDate,
    adherence_pct: review.adherencePct,
    waist_change_inches: review.waistChangeInches,
    weight_change_lbs: review.weightChangeLbs,
    sleep_minutes_avg: review.sleepMinutesAvg,
    step_consistency_pct: review.stepConsistencyPct,
    nutrition_compliance_ratio: review.nutritionComplianceRatio,
    alcohol_drinks_total: review.alcoholDrinksTotal,
    status: review.status,
    summary_md: review.summaryMd,
  }).select('id').single();

  // Compare prior-week signals to detect trend direction for the selector.
  const prior = await supabase.from('weekly_reviews').select('sleep_minutes_avg,step_consistency_pct')
    .eq('user_id', user_id).lt('week_start_date', week_start_date)
    .order('week_start_date', { ascending: false }).limit(1).maybeSingle();

  const { readinessByDayAvg } = {
    readinessByDayAvg: average((readiness.data ?? []).map((r) => r.readiness_score).filter(Boolean) as number[]),
  };
  const priorReadiness = prior.data?.sleep_minutes_avg
    ? await loadPriorReadiness(supabase, user_id, week_start_date)
    : null;

  const recommendation = selectAdjustment({
    review,
    plateauWeeks: plateau.data?.weeks_in_plateau ?? 0,
    sleepTrendDown: (prior.data?.sleep_minutes_avg ?? 0) > review.sleepMinutesAvg,
    readinessTrendDown: priorReadiness != null && readinessByDayAvg != null
      ? readinessByDayAvg < priorReadiness : false,
    stepsTrendDown: (prior.data?.step_consistency_pct ?? 0) > review.stepConsistencyPct,
  });

  await supabase.from('adjustments').insert({
    user_id,
    weekly_review_id: insertedReview?.id,
    action: recommendation.action,
    trigger_signal: recommendation.triggerSignal,
    supporting_data: recommendation.supportingData,
    reason: recommendation.reason,
    expected_outcome: recommendation.expectedOutcome,
  });

  classifyAlcoholWeek(drinksTotal, { sleep: false, adherence: false, weightTrend: false });

  await supabase.from('events').insert([
    { user_id, event_type: 'weekly.review_created', subject_week_start: week_start_date, payload: review },
    { user_id, event_type: 'adjustment.proposed', subject_week_start: week_start_date, payload: recommendation },
  ]);

  return Response.json({ review, recommendation });
});

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function average(xs: number[]): number | null {
  return xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length;
}
async function loadPriorReadiness(supabase: any, userId: string, weekStart: string): Promise<number | null> {
  const prevStart = addDays(weekStart, -7);
  const prevEnd = addDays(weekStart, -1);
  const { data } = await supabase.from('oura_readiness')
    .select('readiness_score').eq('user_id', userId)
    .gte('day', prevStart).lte('day', prevEnd);
  const xs = (data ?? []).map((r: any) => r.readiness_score).filter(Boolean);
  return average(xs);
}
