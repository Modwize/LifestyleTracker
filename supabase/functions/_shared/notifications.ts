// Schedules notifications for the next 24h into the `notifications` table.
// Reads the engine planner and persists the plan with idempotency per (user, kind, scheduled_for).

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { planDailyNotifications } from '../../../src/engine/notifications.ts';
import { addDays } from './db.ts';

export async function scheduleNotificationsForDay(
  db: SupabaseClient,
  userId: string,
  day: string,
  timezone: string,
  wakeStart: string,
  isCheckInDay: boolean,
  opts: {
    hasPendingAdjustment: boolean;
    hasOpenReset: boolean;
    hasRegressionAlert: boolean;
    hasPatternAlert: boolean;
    isAdherenceLowMidday: boolean;
    maxPerDay: number;
  },
): Promise<number> {
  const plan = planDailyNotifications({
    day,
    timezone,
    wakeStartLocal: wakeStart.slice(0, 5),
    isCheckInDay,
    ...opts,
  });

  // Upsert each planned notification. Key: (user_id, kind, scheduled_for).
  // We don't have a unique index on that tuple yet, so we check-then-insert.
  let inserted = 0;
  for (const n of plan) {
    const scheduledForTs = toTimestampWithTz(n.scheduledFor, timezone);
    const { data: existing } = await db.from('notifications')
      .select('id').eq('user_id', userId).eq('kind', n.kind)
      .eq('scheduled_for', scheduledForTs).maybeSingle();
    if (existing) continue;
    const { error } = await db.from('notifications').insert({
      user_id: userId,
      kind: n.kind,
      scheduled_for: scheduledForTs,
      payload: n.payload,
    });
    if (!error) inserted++;
  }
  return inserted;
}

// Convert "YYYY-MM-DDTHH:MM:SS" (local) + tz → ISO string with correct UTC offset.
function toTimestampWithTz(localIso: string, tz: string): string {
  // Re-interpret the local time in the user's timezone and emit UTC ISO.
  // Trick: build date components, then use Intl to get the tz offset for that instant.
  const [date, time] = localIso.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm, ss] = time.split(':').map(Number);
  // Start with a UTC guess; correct for tz offset at that instant.
  const utcGuess = new Date(Date.UTC(y, m - 1, d, hh, mm, ss));
  const offsetMinutes = timezoneOffsetMinutes(utcGuess, tz);
  // Local time is UTC + offset; so UTC = local - offset.
  const corrected = new Date(utcGuess.getTime() - offsetMinutes * 60_000);
  return corrected.toISOString();
}

function timezoneOffsetMinutes(instant: Date, tz: string): number {
  const tzString = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, timeZoneName: 'shortOffset',
  }).formatToParts(instant).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = /GMT([+\-])(\d{1,2})(?::?(\d{2}))?/.exec(tzString);
  if (!m) return 0;
  const sign = m[1] === '-' ? -1 : 1;
  const hours = parseInt(m[2], 10);
  const mins = m[3] ? parseInt(m[3], 10) : 0;
  return sign * (hours * 60 + mins);
}

// Suppress any unsent notification for a user (e.g. daily cap reached).
export async function markSuppressed(
  db: SupabaseClient, id: string, reason: string,
): Promise<void> {
  await db.from('notifications').update({ suppressed_reason: reason }).eq('id', id);
}

export { addDays };
