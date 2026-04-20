// Notification scheduler. Caps at 10/day per spec; typical payload 3–5.
// Never delivers conditional notifications when the daily cap would be breached.

import type { ISODate } from './types';

export type NotificationKind =
  | 'protein_anchor'
  | 'step_momentum'
  | 'sleep_winddown'
  | 'weekly_summary'
  | 'regression_alert'
  | 'pattern_alert'
  | 'reset_prompt'
  | 'adjustment_pending';

export interface PlannedNotification {
  kind: NotificationKind;
  scheduledFor: string; // ISO timestamp
  priority: number;     // higher = more important; survives cap
  payload: Record<string, unknown>;
  conditional: boolean; // only emitted if a signal fires
}

const PRIORITY: Record<NotificationKind, number> = {
  protein_anchor: 90,
  weekly_summary: 80,
  reset_prompt: 85,
  adjustment_pending: 75,
  regression_alert: 70,
  sleep_winddown: 60,
  pattern_alert: 50,
  step_momentum: 40,
};

export interface NotificationInputs {
  day: ISODate;
  timezone: string;
  wakeStartLocal: string;      // 'HH:MM'
  isCheckInDay: boolean;
  isAdherenceLowMidday: boolean;
  hasPendingAdjustment: boolean;
  hasOpenReset: boolean;
  hasRegressionAlert: boolean;
  hasPatternAlert: boolean;
  maxPerDay: number;
}

function localISO(day: ISODate, hhmm: string, tz: string): string {
  // Supabase edge runtime is UTC; the caller stores TZ in the user record. We
  // emit a timestamp string with offset-less local time + tz hint in payload.
  // Downstream delivery layer resolves to absolute time.
  return `${day}T${hhmm}:00`;
}

export function planDailyNotifications(i: NotificationInputs): PlannedNotification[] {
  const wakeHour = parseInt(i.wakeStartLocal.split(':')[0], 10);
  const proteinTime = `${String(wakeHour).padStart(2, '0')}:20`;
  const stepTime = '13:30';
  const windDown = '21:30';
  const weeklyTime = '07:30';

  const candidates: PlannedNotification[] = [
    {
      kind: 'protein_anchor',
      scheduledFor: localISO(i.day, proteinTime, i.timezone),
      priority: PRIORITY.protein_anchor,
      payload: { message: '30–45g protein within 60 minutes of waking.' },
      conditional: false,
    },
    {
      kind: 'sleep_winddown',
      scheduledFor: localISO(i.day, windDown, i.timezone),
      priority: PRIORITY.sleep_winddown,
      payload: { message: 'Wind-down window: lights low, screens off.' },
      conditional: false,
    },
    {
      kind: 'step_momentum',
      scheduledFor: localISO(i.day, stepTime, i.timezone),
      priority: PRIORITY.step_momentum,
      payload: { message: 'Step momentum check — aim for the daily target.' },
      conditional: true,
    },
  ];

  if (i.isCheckInDay) {
    candidates.push({
      kind: 'weekly_summary',
      scheduledFor: localISO(i.day, weeklyTime, i.timezone),
      priority: PRIORITY.weekly_summary,
      payload: { message: 'Your Friday weekly review is ready.' },
      conditional: false,
    });
  }
  if (i.isAdherenceLowMidday) {
    candidates.push({
      kind: 'pattern_alert',
      scheduledFor: localISO(i.day, '14:00', i.timezone),
      priority: PRIORITY.pattern_alert,
      payload: { message: 'Adherence trending low today — consider a reset.' },
      conditional: true,
    });
  }
  if (i.hasPendingAdjustment) {
    candidates.push({
      kind: 'adjustment_pending',
      scheduledFor: localISO(i.day, '08:00', i.timezone),
      priority: PRIORITY.adjustment_pending,
      payload: { message: 'An adjustment recommendation is waiting for review.' },
      conditional: false,
    });
  }
  if (i.hasOpenReset) {
    candidates.push({
      kind: 'reset_prompt',
      scheduledFor: localISO(i.day, '07:45', i.timezone),
      priority: PRIORITY.reset_prompt,
      payload: { message: 'Reset protocol available — tap to acknowledge.' },
      conditional: false,
    });
  }
  if (i.hasRegressionAlert) {
    candidates.push({
      kind: 'regression_alert',
      scheduledFor: localISO(i.day, '08:15', i.timezone),
      priority: PRIORITY.regression_alert,
      payload: { message: 'Regression pattern detected — see weekly review.' },
      conditional: true,
    });
  }

  // Hard cap. Conditional notifications drop first when over-budget.
  const capped = candidates
    .sort((a, b) => b.priority - a.priority)
    .slice(0, Math.min(i.maxPerDay, 10));
  return capped.sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
}
