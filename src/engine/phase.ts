// Phase-transition suggestion. Spec: transitions require manual approval,
// so this returns a proposal, never auto-mutates state.

import type { PhaseMode } from './types';

export interface PhaseContext {
  currentMode: PhaseMode;
  signals: {
    surgeryScheduledWithinDays?: number | null;
    surgeryCompletedDaysAgo?: number | null;
    rehabClearedBy?: string | null;    // ISO date when PT clears build-back
    newbornInHouse?: boolean;
    sleepDeficitDaysInRow?: number;
    readinessSubThresholdDays?: number;
  };
}

export interface PhaseTransitionProposal {
  proposed: boolean;
  toMode?: PhaseMode;
  reason?: string;
  expectedOutcome?: string;
  triggerSignal?: Record<string, unknown>;
}

export function proposePhaseTransition(ctx: PhaseContext): PhaseTransitionProposal {
  const s = ctx.signals;

  if (ctx.currentMode === 'normal' && (s.surgeryScheduledWithinDays ?? 999) <= 21) {
    return {
      proposed: true,
      toMode: 'pre_surgery',
      reason: 'Surgery scheduled within 3 weeks — prioritise sleep and protein.',
      expectedOutcome: 'Reduced step target, increased sleep weight, workout weight halved.',
      triggerSignal: { surgery_in_days: s.surgeryScheduledWithinDays },
    };
  }
  if (ctx.currentMode === 'pre_surgery' && (s.surgeryCompletedDaysAgo ?? -1) >= 0) {
    return {
      proposed: true,
      toMode: 'post_surgery',
      reason: 'Surgery completed — shift to recovery weighting.',
      expectedOutcome: 'Workouts paused, nutrition and protein prioritised.',
      triggerSignal: { days_since_surgery: s.surgeryCompletedDaysAgo },
    };
  }
  if (ctx.currentMode === 'post_surgery' && s.rehabClearedBy) {
    return {
      proposed: true,
      toMode: 'rehab',
      reason: 'PT has authorised rehab-phase movement.',
      expectedOutcome: 'Reintroduce light movement; keep nutrition/sleep emphasis.',
      triggerSignal: { rehab_cleared_by: s.rehabClearedBy },
    };
  }
  if (ctx.currentMode === 'normal' && s.newbornInHouse) {
    return {
      proposed: true,
      toMode: 'newborn_disruption',
      reason: 'Newborn-in-house phase detected — sleep disruption expected.',
      expectedOutcome: 'Sleep weight temporarily reduced to avoid false regressions.',
      triggerSignal: { newborn: true },
    };
  }

  return { proposed: false };
}
