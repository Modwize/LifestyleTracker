// Reset protocol trigger. Spec: 2–3 low-adherence days → propose reset.
// Never auto-activates; requires user acknowledgment.

import { LOW_ADHERENCE_SCORE } from './adherence';

export interface ResetTrigger {
  triggered: boolean;
  lowDays: number;
  lookbackDays: number;
  reason: string;
}

export function evaluateResetTrigger(
  recentScores: Array<{ day: string; score: number }>,
): ResetTrigger {
  const window = recentScores.slice(-3);
  const lowDays = window.filter((d) => d.score < LOW_ADHERENCE_SCORE).length;
  const triggered = lowDays >= 2;
  return {
    triggered,
    lowDays,
    lookbackDays: window.length,
    reason: triggered
      ? `${lowDays} of last ${window.length} days scored below ${LOW_ADHERENCE_SCORE}`
      : 'stable adherence',
  };
}

// Reset playbook. Surfaced to the user as a suggestion card.
export const RESET_PROTOCOL = {
  proteinBreakfastPriority: true,
  hydrationEmphasis: true,
  simplifiedMealsHours: 48,
  punishmentLogic: false,
  stepBufferBonus: 500,
  sleepPriorityEmphasis: true,
};
