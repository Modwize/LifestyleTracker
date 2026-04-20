// Phase-1 step ladder + recovery-aware compression.

import type { PhaseMode } from './types';

export interface StepPlanPoint {
  phase: number;
  weekInPhase: number;
  stepTarget: number;
}

// Phase 1 ladder from the spec: 4k → 6k → 8k → 10k over 8 weeks.
export const PHASE_1_LADDER: StepPlanPoint[] = [
  { phase: 1, weekInPhase: 1, stepTarget: 4000 },
  { phase: 1, weekInPhase: 2, stepTarget: 4000 },
  { phase: 1, weekInPhase: 3, stepTarget: 6000 },
  { phase: 1, weekInPhase: 4, stepTarget: 6000 },
  { phase: 1, weekInPhase: 5, stepTarget: 8000 },
  { phase: 1, weekInPhase: 6, stepTarget: 8000 },
  { phase: 1, weekInPhase: 7, stepTarget: 10000 },
  { phase: 1, weekInPhase: 8, stepTarget: 10000 },
];

// Recovery modes collapse the step expectation. Post-surgery effectively pauses it.
const RECOVERY_MULTIPLIERS: Partial<Record<PhaseMode, number>> = {
  pre_surgery: 0.9,
  post_surgery: 0.4,
  rehab: 0.7,
  newborn_disruption: 0.8,
  return_to_build: 1.0,
};

export function resolveStepTarget(
  phase: number,
  weekInPhase: number,
  phaseMode: PhaseMode,
): number {
  const rung = PHASE_1_LADDER.find(
    (p) => p.phase === phase && p.weekInPhase === Math.min(weekInPhase, 8),
  );
  const base = rung?.stepTarget ?? 10000;
  const mult = RECOVERY_MULTIPLIERS[phaseMode] ?? 1.0;
  return Math.round((base * mult) / 250) * 250; // round to nearest 250
}
