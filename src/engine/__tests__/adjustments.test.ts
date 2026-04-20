// Adjustment selector determinism.

import { selectAdjustment } from '../adjustments';
import type { WeeklyReviewResult } from '../types';

function review(overrides: Partial<WeeklyReviewResult>): WeeklyReviewResult {
  return {
    weekStartDate: '2026-04-17',
    adherencePct: 85,
    waistChangeInches: -0.25,
    weightChangeLbs: -1.2,
    sleepMinutesAvg: 440,
    stepConsistencyPct: 85,
    nutritionComplianceRatio: 0.85,
    status: 'on_track',
    alcoholDrinksTotal: 3,
    summaryMd: '',
    ...overrides,
  };
}

function assert(c: boolean, m: string) { if (!c) throw new Error(m); }

// Low adherence → simplify.
let r = selectAdjustment({
  review: review({ adherencePct: 62 }),
  plateauWeeks: 0,
  sleepTrendDown: false, readinessTrendDown: false, stepsTrendDown: false,
});
assert(r.action === 'simplify_plan', `expected simplify_plan, got ${r.action}`);

// Sleep down + readiness down → recovery_mode wins even if adherence fine.
r = selectAdjustment({
  review: review({ adherencePct: 88 }),
  plateauWeeks: 0,
  sleepTrendDown: true, readinessTrendDown: true, stepsTrendDown: false,
});
assert(r.action === 'recovery_mode', `expected recovery_mode, got ${r.action}`);

// High adherence + waist moving → continue.
r = selectAdjustment({
  review: review({ adherencePct: 86, waistChangeInches: -0.3, status: 'on_track' }),
  plateauWeeks: 0,
  sleepTrendDown: false, readinessTrendDown: false, stepsTrendDown: false,
});
assert(r.action === 'continue', `expected continue, got ${r.action}`);

// High adherence + waist flat → suggest_adjustment.
r = selectAdjustment({
  review: review({ adherencePct: 85, waistChangeInches: 0, status: 'on_track' }),
  plateauWeeks: 0,
  sleepTrendDown: false, readinessTrendDown: false, stepsTrendDown: false,
});
assert(r.action === 'suggest_adjustment', `expected suggest_adjustment, got ${r.action}`);

// Plateau ladder climbs week-over-week.
r = selectAdjustment({
  review: review({ status: 'plateau_confirmed', waistChangeInches: 0, adherencePct: 84 }),
  plateauWeeks: 3,
  sleepTrendDown: false, readinessTrendDown: false, stepsTrendDown: false,
});
assert(r.action === 'movement_adjustment', `expected movement_adjustment, got ${r.action}`);

console.log('adjustment tests passed');
