// Measurement helpers: waist averaging + waist-to-height ratio.

export interface WaistReading {
  reading1Inches: number;
  reading2Inches: number;
}

export interface WaistResult {
  averageInches: number;
  ratio: number;
}

export function averageWaist(r: WaistReading): number {
  return Math.round(((r.reading1Inches + r.reading2Inches) / 2) * 100) / 100;
}

export function waistToHeightRatio(waistInches: number, heightInches: number): number {
  if (heightInches <= 0) throw new Error('heightInches must be positive');
  return Math.round((waistInches / heightInches) * 1000) / 1000;
}

export function resolveWaist(r: WaistReading, heightInches: number): WaistResult {
  const averageInches = averageWaist(r);
  return { averageInches, ratio: waistToHeightRatio(averageInches, heightInches) };
}

// Phase-1 → Optimal target ladder (spec: 39 / 37 / 35.5 / ≤35).
export const WAIST_TARGETS_INCHES = {
  phase1: 39,
  phase2: 37,
  phase3: 35.5,
  optimal: 35,
};

export function phaseForWaist(waistInches: number): 1 | 2 | 3 | 4 {
  if (waistInches > WAIST_TARGETS_INCHES.phase1) return 1;
  if (waistInches > WAIST_TARGETS_INCHES.phase2) return 2;
  if (waistInches > WAIST_TARGETS_INCHES.phase3) return 3;
  return 4;
}
