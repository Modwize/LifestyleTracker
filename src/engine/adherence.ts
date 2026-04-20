// Daily adherence scoring.
//
// Components are each mapped to 0..1. Missing data returns null for that component,
// and its weight is redistributed across the remaining components. The spec calls
// out "no punishment logic" — we don't penalise a user for data the coach doesn't
// have yet (typical on same-day compute before Oura syncs).

import type {
  DailyAdherenceResult,
  DailyLogInput,
  NutritionCompliance,
  PhaseMode,
  ScoreWeights,
} from './types';
import { resolveWeights } from './weights';

const NUTRITION_SCORE: Record<NutritionCompliance, number> = {
  fully_compliant: 1.00,
  mostly_compliant: 0.75,
  off_plan_recovered: 0.50,
  off_plan: 0.00,
};

// 30-30-30: 30–45g protein within 60 min of waking.
function scoreProteinAnchor(log: DailyLogInput): number | null {
  if (log.proteinBreakfastCompleted == null) return null;
  if (!log.proteinBreakfastCompleted) return 0;
  const grams = log.proteinBreakfastGrams ?? 0;
  const mins = log.proteinBreakfastMinutesAfterWake ?? 999;
  if (mins > 60) return 0.5;          // completed but late
  if (grams < 30) return 0.75;        // on-time but short
  return 1;
}

function scoreSteps(log: DailyLogInput): number | null {
  if (log.stepsTotal == null || log.stepsTarget == null || log.stepsTarget <= 0) return null;
  return Math.max(0, Math.min(1, log.stepsTotal / log.stepsTarget));
}

function scoreSleep(log: DailyLogInput): number | null {
  if (log.sleepMinutes == null) return null;
  const ratio = log.sleepMinutes / log.sleepThresholdMinutes;
  return Math.max(0, Math.min(1, ratio));
}

function scoreWorkout(log: DailyLogInput): number | null {
  if (!log.workoutScheduled) return null;   // no schedule → excluded
  if (log.workoutCompleted == null) return null;
  return log.workoutCompleted ? 1 : 0;
}

function scoreNutrition(log: DailyLogInput): number | null {
  if (log.nutritionCompliance == null) return null;
  return NUTRITION_SCORE[log.nutritionCompliance];
}

// Redistribute null-component weights proportionally onto observed components.
function redistribute(
  components: Record<keyof ScoreWeights, number | null>,
  weights: ScoreWeights,
): { effectiveWeights: ScoreWeights; score: number } {
  const keys = Object.keys(weights) as (keyof ScoreWeights)[];
  let presentWeight = 0;
  for (const k of keys) if (components[k] != null) presentWeight += weights[k];
  if (presentWeight === 0) return { effectiveWeights: weights, score: 0 };
  const effective = { ...weights };
  let score = 0;
  for (const k of keys) {
    if (components[k] == null) {
      effective[k] = 0;
    } else {
      effective[k] = weights[k] / presentWeight;
      score += effective[k] * (components[k] as number);
    }
  }
  return { effectiveWeights: effective, score };
}

export function computeDailyAdherence(
  log: DailyLogInput,
  phase: PhaseMode,
): DailyAdherenceResult {
  // Cheat day: spec says "no punishment logic". We still compute a score but
  // nutrition is treated as mostly_compliant if the user stayed within window.
  const nutritionForScoring: NutritionCompliance | null = log.cheatDay && log.nutritionCompliance == null
    ? 'mostly_compliant'
    : log.nutritionCompliance;

  const components = {
    nutrition: scoreNutrition({ ...log, nutritionCompliance: nutritionForScoring }),
    protein: scoreProteinAnchor(log),
    steps: scoreSteps(log),
    sleep: scoreSleep(log),
    workout: scoreWorkout(log),
  };

  const baseWeights = resolveWeights(phase, log.workoutScheduled);
  const { effectiveWeights, score } = redistribute(components, baseWeights);

  return {
    day: log.day,
    score: Math.round(score * 1000) / 10, // 0..100 with one decimal
    components,
    weights: effectiveWeights,
    phaseMode: phase,
  };
}

// Streak helpers. "Qualifying day" = score >= 80. Comeback = ≥3 qualifying days
// after any low-adherence cluster (reset trigger window).
export const QUALIFYING_SCORE = 80;
export const LOW_ADHERENCE_SCORE = 60;

export function updateStreak(
  prevStreak: number,
  prevComeback: number,
  todaysScore: number,
  yesterdayQualifying: boolean,
): { adherenceStreak: number; comebackStreak: number } {
  const qualifying = todaysScore >= QUALIFYING_SCORE;
  const adherenceStreak = qualifying ? prevStreak + 1 : 0;
  // Comeback: started after a break; counts until adherence streak reaches 7.
  const comebackStreak =
    qualifying && !yesterdayQualifying ? 1 :
    qualifying && prevComeback > 0 && prevComeback < 7 ? prevComeback + 1 :
    qualifying && prevComeback >= 7 ? 0 :
    0;
  return { adherenceStreak, comebackStreak };
}
