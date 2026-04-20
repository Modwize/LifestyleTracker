// Basic regression tests for the scoring engine. Run with any Node test runner.

import { computeDailyAdherence } from '../adherence';
import type { DailyLogInput } from '../types';

function baseLog(overrides: Partial<DailyLogInput> = {}): DailyLogInput {
  return {
    day: '2026-04-17',
    proteinBreakfastCompleted: true,
    proteinBreakfastGrams: 35,
    proteinBreakfastMinutesAfterWake: 30,
    stepsTotal: 8000,
    stepsTarget: 8000,
    sleepMinutes: 450,
    sleepThresholdMinutes: 420,
    nutritionCompliance: 'fully_compliant',
    workoutScheduled: true,
    workoutCompleted: true,
    cheatDay: false,
    ...overrides,
  };
}

// Quick assertion helpers — zero-dep so this file drops into any runner.
function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

// 1) Perfect day + normal phase = 100.
const perfect = computeDailyAdherence(baseLog(), 'normal');
assert(perfect.score === 100, `perfect should be 100, got ${perfect.score}`);

// 2) Missed steps by 50% drops score but not below nutrition+protein+sleep+workout.
const halfSteps = computeDailyAdherence(baseLog({ stepsTotal: 4000 }), 'normal');
assert(halfSteps.score < 100 && halfSteps.score >= 85, `halfSteps in band, got ${halfSteps.score}`);

// 3) Missing workout schedule zeroes the workout weight (not penalised).
const noWorkout = computeDailyAdherence(
  baseLog({ workoutScheduled: false, workoutCompleted: null }),
  'normal',
);
assert(noWorkout.weights.workout === 0, 'unscheduled workout weight should be 0');

// 4) Post-surgery phase: workout weight vanishes regardless.
const postSurgery = computeDailyAdherence(baseLog({ workoutScheduled: true }), 'post_surgery');
assert(postSurgery.weights.workout === 0, 'post_surgery should zero workout weight');

// 5) Missing sleep signal redistributes to other components (no punishment).
const noSleep = computeDailyAdherence(baseLog({ sleepMinutes: null }), 'normal');
assert(noSleep.weights.sleep === 0, 'missing sleep → zero sleep weight');
assert(Math.abs(noSleep.weights.nutrition + noSleep.weights.protein + noSleep.weights.steps + noSleep.weights.workout - 1) < 1e-9,
  'weights should still sum to 1');

console.log('adherence tests passed');
