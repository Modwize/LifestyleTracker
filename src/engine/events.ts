// Event bus. Every compute step emits into an append-only log so we can replay
// and explain any coach decision ("why did you recommend X?").

import type { ISODate } from './types';

export type EventType =
  | 'steps.ingested'
  | 'sleep.ingested'
  | 'readiness.ingested'
  | 'nutrition.ingested'
  | 'weight.ingested'
  | 'waist.recorded'
  | 'workout.logged'
  | 'alcohol.logged'
  | 'document.ingested'
  | 'daily.log_updated'
  | 'daily.score_computed'
  | 'streak.incremented'
  | 'streak.broken'
  | 'comeback.detected'
  | 'weekly.review_created'
  | 'weekly.status_classified'
  | 'plateau.detected'
  | 'plateau.escalated'
  | 'plateau.resolved'
  | 'adjustment.proposed'
  | 'adjustment.decided'
  | 'reset.triggered'
  | 'reset.acknowledged'
  | 'reset.completed'
  | 'phase.transition_requested'
  | 'phase.transition_decided'
  | 'notification.scheduled'
  | 'notification.delivered'
  | 'notification.suppressed'
  | 'milestone.awarded';

export interface EngineEvent {
  userId: string;
  eventType: EventType;
  occurredAt: string;
  subjectDay?: ISODate;
  subjectWeekStart?: ISODate;
  subjectId?: string;
  payload: Record<string, unknown>;
  causedByEventId?: number;
}

export interface EventSink {
  emit(event: EngineEvent): Promise<void>;
}

export class InMemoryEventSink implements EventSink {
  public readonly events: EngineEvent[] = [];
  async emit(e: EngineEvent): Promise<void> {
    this.events.push(e);
  }
}

// Helpers: common event factories so callers can't drift the shape.
export function dailyScoreComputed(
  userId: string,
  day: ISODate,
  score: number,
  causedByEventId?: number,
): EngineEvent {
  return {
    userId,
    eventType: 'daily.score_computed',
    occurredAt: new Date().toISOString(),
    subjectDay: day,
    payload: { score },
    causedByEventId,
  };
}

export function adjustmentProposed(
  userId: string,
  weekStart: ISODate,
  action: string,
  reason: string,
  triggerSignal: Record<string, unknown>,
): EngineEvent {
  return {
    userId,
    eventType: 'adjustment.proposed',
    occurredAt: new Date().toISOString(),
    subjectWeekStart: weekStart,
    payload: { action, reason, triggerSignal },
  };
}
