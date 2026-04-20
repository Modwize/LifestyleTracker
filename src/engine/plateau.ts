// Plateau detection + escalation ladder.
//
// Plateau = no waist change AND no weight trend change AND adherence >= 80%
// for 7 days. Response ladder escalates week over week.

import type { AdjustmentAction } from './types';

export interface PlateauWindow {
  waistChangeInches: number | null;
  weightTrendSlope: number | null;    // lbs/day over the window
  adherencePct: number;
  windowDays: number;
}

const PLATEAU_WAIST_TOLERANCE = 0.1;   // inches
const PLATEAU_WEIGHT_TOLERANCE = 0.05; // lbs/day

export function isPlateau(w: PlateauWindow): boolean {
  if (w.windowDays < 7) return false;
  if (w.adherencePct < 80) return false;
  const waistFlat = w.waistChangeInches == null
    || Math.abs(w.waistChangeInches) <= PLATEAU_WAIST_TOLERANCE;
  const weightFlat = w.weightTrendSlope == null
    || Math.abs(w.weightTrendSlope) <= PLATEAU_WEIGHT_TOLERANCE;
  return waistFlat && weightFlat;
}

// Ladder from spec. Week N of plateau maps to escalating rungs.
export const PLATEAU_LADDER: AdjustmentAction[] = [
  'behavioral_correction',   // week 1
  'nutrition_adjustment',    // week 2
  'movement_adjustment',     // week 3
  'protocol_redesign',       // week 4+
];

export function plateauAction(weeksInPlateau: number): AdjustmentAction {
  const idx = Math.max(0, Math.min(PLATEAU_LADDER.length - 1, weeksInPlateau - 1));
  return PLATEAU_LADDER[idx];
}
