// Adaptive weight selection. Baseline weights come from the spec; phase-mode
// multipliers re-balance them (e.g. injury mode compresses workout weight).

import type { PhaseMode, ScoreWeights } from './types';

export const BASELINE_WEIGHTS: ScoreWeights = {
  nutrition: 0.30,
  protein: 0.20,
  steps: 0.20,
  sleep: 0.20,
  workout: 0.10,
};

// Per-phase multipliers. Workouts compress in recovery modes; sleep/nutrition lift.
export const PHASE_MULTIPLIERS: Record<PhaseMode, ScoreWeights> = {
  normal:             { nutrition: 1.00, protein: 1.00, steps: 1.00, sleep: 1.00, workout: 1.00 },
  pre_surgery:        { nutrition: 1.05, protein: 1.05, steps: 0.90, sleep: 1.10, workout: 0.50 },
  post_surgery:       { nutrition: 1.10, protein: 1.15, steps: 0.60, sleep: 1.20, workout: 0.00 },
  rehab:              { nutrition: 1.05, protein: 1.05, steps: 0.80, sleep: 1.10, workout: 0.60 },
  newborn_disruption: { nutrition: 1.05, protein: 1.05, steps: 0.80, sleep: 0.70, workout: 0.80 },
  return_to_build:    { nutrition: 1.00, protein: 1.00, steps: 1.00, sleep: 1.00, workout: 1.10 },
};

// Normalise so components always sum to exactly 1.0.
// Workouts are additionally zeroed when not scheduled (so off-days aren't penalised).
export function resolveWeights(phase: PhaseMode, workoutScheduled: boolean): ScoreWeights {
  const mult = PHASE_MULTIPLIERS[phase];
  const raw: ScoreWeights = {
    nutrition: BASELINE_WEIGHTS.nutrition * mult.nutrition,
    protein:   BASELINE_WEIGHTS.protein   * mult.protein,
    steps:     BASELINE_WEIGHTS.steps     * mult.steps,
    sleep:     BASELINE_WEIGHTS.sleep     * mult.sleep,
    workout:   workoutScheduled ? BASELINE_WEIGHTS.workout * mult.workout : 0,
  };
  const total = raw.nutrition + raw.protein + raw.steps + raw.sleep + raw.workout;
  if (total === 0) return BASELINE_WEIGHTS;
  return {
    nutrition: raw.nutrition / total,
    protein:   raw.protein   / total,
    steps:     raw.steps     / total,
    sleep:     raw.sleep     / total,
    workout:   raw.workout   / total,
  };
}
