// Friday weekly review. Rolls daily signals into a single adherence story +
// classifies the week into a deterministic status.

import type {
  WeeklyReviewInput,
  WeeklyReviewResult,
  WeeklyStatus,
} from './types';
import { isPlateau } from './plateau';

function avg(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

// OLS slope (lbs/day) on the week's weight series. Null when <3 points.
function weightSlope(previous: number | null, current: number | null, days: number): number | null {
  if (previous == null || current == null || days <= 0) return null;
  return (current - previous) / days;
}

function classify(
  adherencePct: number,
  waistChange: number | null,
  sleepAvgMins: number,
  readinessAvg: number | null,
  plateauWeeks: number,
  plateauWindow: boolean,
): WeeklyStatus {
  // Recovery signal wins — spec: sleep↓ AND readiness↓ → suggest recovery mode.
  if (sleepAvgMins < 360 && (readinessAvg != null && readinessAvg < 70)) {
    return 'recovery_advised';
  }
  if (adherencePct < 70) return 'simplify';
  if (plateauWeeks >= 1 && plateauWindow) {
    return plateauWeeks >= 2 ? 'plateau_confirmed' : 'plateau_watch';
  }
  if (adherencePct >= 80 && waistChange != null && waistChange < -0.1) {
    return 'on_track';
  }
  if (adherencePct >= 80 && (waistChange == null || Math.abs(waistChange) <= 0.1)) {
    return 'plateau_watch';
  }
  if (waistChange != null && waistChange > 0.25) return 'regression';
  return 'on_track';
}

export function runWeeklyReview(input: WeeklyReviewInput): WeeklyReviewResult {
  const adherencePct = Math.round(
    avg(input.dailyScores.map((d) => d.score)) * 10,
  ) / 10;

  const waistChangeInches =
    input.waist.previous != null && input.waist.current != null
      ? Math.round((input.waist.current - input.waist.previous) * 100) / 100
      : null;

  const weightChangeLbs =
    input.weight.previous != null && input.weight.current != null
      ? Math.round((input.weight.current - input.weight.previous) * 100) / 100
      : null;

  const sleepMinutesAvg = Math.round(
    avg(input.sleepMinutesByDay.map((d) => d.minutes ?? 0).filter((m) => m > 0)),
  );

  const stepsHitDays = input.stepsByDay.filter((s) => s.steps >= s.target).length;
  const stepConsistencyPct = input.stepsByDay.length === 0
    ? 0
    : Math.round((stepsHitDays / input.stepsByDay.length) * 1000) / 10;

  const compliantDays = input.nutritionByDay.filter(
    (n) => n.compliance === 'fully_compliant' || n.compliance === 'mostly_compliant',
  ).length;
  const nutritionComplianceRatio =
    input.nutritionByDay.length === 0
      ? 0
      : Math.round((compliantDays / input.nutritionByDay.length) * 1000) / 1000;

  const readinessAvg = (() => {
    const xs = input.readinessByDay.map((r) => r.readiness).filter((r): r is number => r != null);
    return xs.length ? avg(xs) : null;
  })();

  const plateauWindow = isPlateau({
    waistChangeInches,
    weightTrendSlope: weightSlope(input.weight.previous, input.weight.current, 7),
    adherencePct,
    windowDays: input.dailyScores.length,
  });

  const status = classify(
    adherencePct,
    waistChangeInches,
    sleepMinutesAvg,
    readinessAvg,
    input.plateauWeeks,
    plateauWindow,
  );

  const summaryMd = [
    `# Weekly Review — ${input.weekStartDate}`,
    ``,
    `- **Adherence**: ${adherencePct}%`,
    `- **Waist**: ${waistChangeInches == null ? 'n/a' : `${waistChangeInches > 0 ? '+' : ''}${waistChangeInches} in`}`,
    `- **Weight**: ${weightChangeLbs == null ? 'n/a' : `${weightChangeLbs > 0 ? '+' : ''}${weightChangeLbs} lbs`}`,
    `- **Sleep avg**: ${Math.floor(sleepMinutesAvg / 60)}h ${sleepMinutesAvg % 60}m`,
    `- **Steps consistency**: ${stepConsistencyPct}%`,
    `- **Nutrition compliance**: ${(nutritionComplianceRatio * 100).toFixed(0)}%`,
    `- **Alcohol**: ${input.alcoholDrinksTotal} drinks`,
    `- **Status**: \`${status}\``,
  ].join('\n');

  return {
    weekStartDate: input.weekStartDate,
    adherencePct,
    waistChangeInches,
    weightChangeLbs,
    sleepMinutesAvg,
    stepConsistencyPct,
    nutritionComplianceRatio,
    status,
    alcoholDrinksTotal: input.alcoholDrinksTotal,
    summaryMd,
  };
}
