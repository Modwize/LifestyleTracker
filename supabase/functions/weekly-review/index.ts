// weekly-review
// Fires Friday morning. Rolls the week up, classifies status, proposes an
// adjustment with full provenance, sends a Telegram summary, emits events.

import {
  runWeeklyReview,
  selectAdjustment,
  classifyAlcoholWeek,
  selectGrocerySuggestions,
} from '../../../src/engine/index.ts';
import { serviceClient, primaryUser, todayISO, addDays } from '../_shared/db.ts';
import { sendMessage } from '../_shared/telegram.ts';

Deno.serve(async (req) => {
  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
  const supabase = serviceClient();

  const user = await primaryUser(supabase);
  const user_id: string = body.user_id ?? user.id;

  // Default week: the Friday-anchored week that just ended (today is Friday → last week).
  const today = todayISO(user.timezone);
  const week_start_date: string = body.week_start_date ?? addDays(today, -7);
  const weekEnd = addDays(week_start_date, 6);

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

  const prior = await supabase.from('weekly_reviews')
    .select('sleep_minutes_avg,step_consistency_pct')
    .eq('user_id', user_id).lt('week_start_date', week_start_date)
    .order('week_start_date', { ascending: false }).limit(1).maybeSingle();

  const readinessByDayAvg = average(
    (readiness.data ?? []).map((r) => r.readiness_score).filter(Boolean) as number[],
  );
  const priorReadiness = await loadPriorReadiness(supabase, user_id, week_start_date);

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

  const alcoholClass = classifyAlcoholWeek(drinksTotal, {
    sleep: (prior.data?.sleep_minutes_avg ?? 0) > review.sleepMinutesAvg,
    adherence: review.adherencePct < 70,
    weightTrend: (review.weightChangeLbs ?? 0) > 0,
  });

  // Grocery hints for next week. Keyed on (user, week, category, item) so
  // re-running the review doesn't duplicate rows.
  const groceries = selectGrocerySuggestions({
    nutritionComplianceRatio: review.nutritionComplianceRatio,
    adherencePct: review.adherencePct,
    waistChangeInches: review.waistChangeInches,
    sleepMinutesAvg: review.sleepMinutesAvg,
    alcoholDrinksTotal: review.alcoholDrinksTotal,
    plateauWeeks: plateau.data?.weeks_in_plateau ?? 0,
  });
  if (groceries.length) {
    await supabase.from('grocery_suggestions').upsert(
      groceries.map((g) => ({
        user_id,
        week_start_date: addDays(week_start_date, 7),   // hints apply to NEXT week
        category: g.category,
        item: g.item,
        rationale: g.rationale,
      })),
      { onConflict: 'user_id,week_start_date,category,item', ignoreDuplicates: true },
    );
  }

  // Milestone check — weekly adherence could have crossed an award threshold.
  await supabase.rpc('award_pending_milestones', { p_user: user_id });

  await supabase.from('events').insert([
    { user_id, event_type: 'weekly.review_created', subject_week_start: week_start_date, payload: review },
    { user_id, event_type: 'adjustment.proposed', subject_week_start: week_start_date, payload: recommendation },
  ]);

  // Send the Friday summary via Telegram.
  const { data: u } = await supabase.from('users').select('telegram_chat_id').eq('id', user_id).single();
  if (u?.telegram_chat_id) {
    const msg = [
      `📊 Weekly review — ${review.weekStartDate}`,
      `Status: ${review.status}`,
      `Adherence: ${review.adherencePct}%`,
      `Waist Δ: ${review.waistChangeInches ?? '—'} in`,
      `Weight Δ: ${review.weightChangeLbs ?? '—'} lbs`,
      `Sleep avg: ${Math.floor(review.sleepMinutesAvg / 60)}h ${review.sleepMinutesAvg % 60}m`,
      `Step consistency: ${review.stepConsistencyPct}%`,
      `Nutrition compliance: ${(review.nutritionComplianceRatio * 100).toFixed(0)}%`,
      `Alcohol: ${review.alcoholDrinksTotal} drinks (${alcoholClass.class})`,
      ``,
      `Recommendation: ${recommendation.action}`,
      `Why: ${recommendation.reason}`,
      `Expected: ${recommendation.expectedOutcome}`,
      ``,
      `/accept or /reject to decide.`,
    ].join('\n');
    try { await sendMessage(Number(u.telegram_chat_id), msg); } catch (_) { /* non-fatal */ }
  }

  return Response.json({ review, recommendation, alcoholClass });
});

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
