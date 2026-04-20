// Deterministic adjustment selector. Every recommendation carries its provenance
// (trigger signal + supporting data + reason + expected outcome) to satisfy the
// spec's Adjustment Transparency Requirement.

import type {
  AdjustmentAction,
  AdjustmentRecommendation,
  WeeklyReviewResult,
} from './types';
import { plateauAction } from './plateau';

export interface AdjustmentContext {
  review: WeeklyReviewResult;
  plateauWeeks: number;
  sleepTrendDown: boolean;       // sleep mins dropped vs prior week
  readinessTrendDown: boolean;   // oura readiness dropped vs prior week
  stepsTrendDown: boolean;
}

// Precedence: recovery > simplify > plateau ladder > continue/adjust.
// Rationale: if the athlete is cooked, nothing else applies.
export function selectAdjustment(ctx: AdjustmentContext): AdjustmentRecommendation {
  const { review } = ctx;

  if (ctx.sleepTrendDown && ctx.readinessTrendDown) {
    return build(
      'recovery_mode',
      { sleep_trend: 'down', readiness_trend: 'down', steps_trend: ctx.stepsTrendDown ? 'down' : 'flat' },
      { sleep_avg_minutes: review.sleepMinutesAvg, status: review.status },
      'Sleep and readiness both declined this week.',
      'Protect recovery: reduce step target, extend sleep window, hold workout intensity.',
    );
  }

  if (review.adherencePct < 70) {
    return build(
      'simplify_plan',
      { adherence_pct: review.adherencePct },
      { status: review.status },
      `Adherence dropped to ${review.adherencePct}% — friction is too high.`,
      'Collapse to protein breakfast + steps floor only until adherence rebuilds to 80%.',
    );
  }

  if (review.status === 'plateau_confirmed' || review.status === 'plateau_watch') {
    const action = plateauAction(Math.max(1, ctx.plateauWeeks));
    return build(
      action,
      { plateau_weeks: ctx.plateauWeeks, waist_change: review.waistChangeInches },
      { adherence_pct: review.adherencePct, status: review.status },
      `Plateau ladder rung ${ctx.plateauWeeks}/4 with adherence at ${review.adherencePct}%.`,
      plateauExpectedOutcome(action),
    );
  }

  if (review.adherencePct >= 80 &&
      review.waistChangeInches != null &&
      review.waistChangeInches < -0.1) {
    return build(
      'continue',
      { adherence_pct: review.adherencePct, waist_change: review.waistChangeInches },
      { status: review.status },
      'Adherence ≥80% and waist trending down — system is working.',
      'No changes. Keep the same plan another week.',
    );
  }

  if (review.adherencePct >= 80) {
    return build(
      'suggest_adjustment',
      { adherence_pct: review.adherencePct, waist_change: review.waistChangeInches },
      { status: review.status },
      'Adherence ≥80% but waist has not moved.',
      'Tighten one lever: either -100 kcal or +1k daily steps.',
    );
  }

  return build(
    'continue',
    { adherence_pct: review.adherencePct },
    { status: review.status },
    'No rule fired; holding the current plan.',
    'Continue as prescribed.',
  );
}

function plateauExpectedOutcome(action: AdjustmentAction): string {
  switch (action) {
    case 'behavioral_correction':
      return 'Lock in protein anchor + sleep window; expect waist to resume movement within 7 days.';
    case 'nutrition_adjustment':
      return 'Reduce intake by 150–200 kcal/day; re-evaluate at next review.';
    case 'movement_adjustment':
      return 'Add a daily step buffer (+1,500) and/or one Zone-2 session; re-evaluate in 7 days.';
    case 'protocol_redesign':
      return 'Escalate to protocol redesign: revisit macros, training phase, and recovery plan.';
    default:
      return 'Continue current plan.';
  }
}

function build(
  action: AdjustmentAction,
  trigger: Record<string, unknown>,
  supporting: Record<string, unknown>,
  reason: string,
  expectedOutcome: string,
): AdjustmentRecommendation {
  return {
    action,
    triggerSignal: trigger,
    supportingData: supporting,
    reason,
    expectedOutcome,
  };
}
