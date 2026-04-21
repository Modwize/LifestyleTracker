// Timeline — the "why did it recommend this" view.
// Groups events by day, oldest at the bottom of each day so you read top-down.

import { createClient } from '@/lib/supabase/server';
import { Card, CardLabel } from '@/components/Card';
import { Header } from '@/components/Header';

export const dynamic = 'force-dynamic';

interface EventRow {
  id: number;
  event_type: string;
  occurred_at: string;
  subject_day: string | null;
  subject_week_start: string | null;
  payload: Record<string, unknown> | null;
}

const PAGE = 100;

export default async function TimelinePage({
  searchParams,
}: { searchParams: { before?: string } }) {
  const supabase = createClient();

  let query = supabase
    .from('events')
    .select('id,event_type,occurred_at,subject_day,subject_week_start,payload')
    .order('occurred_at', { ascending: false })
    .limit(PAGE);
  if (searchParams.before) query = query.lt('occurred_at', searchParams.before);

  const { data } = await query;
  const events = (data ?? []) as EventRow[];
  const grouped = groupByLocalDay(events);
  const oldest = events[events.length - 1];

  return (
    <>
      <Header today={new Date()} />

      <main className="space-y-3 px-3 pb-6">
        {grouped.length === 0 && (
          <Card>
            <p className="text-sm text-zinc-500">
              No events yet. Daily and weekly rollups will populate this timeline automatically.
            </p>
          </Card>
        )}

        {grouped.map(([day, list]) => (
          <Card key={day}>
            <CardLabel>{formatDayHeader(day)}</CardLabel>
            <ul className="-my-1 divide-y divide-zinc-100 dark:divide-zinc-800">
              {list.map((e) => (
                <li key={e.id} className="py-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[14px] tracking-tightish">
                      {humanEvent(e.event_type)}
                    </span>
                    <span className="text-[11px] tabular-nums text-zinc-500">
                      {formatTime(e.occurred_at)}
                    </span>
                  </div>
                  {renderPayload(e)}
                </li>
              ))}
            </ul>
          </Card>
        ))}

        {events.length === PAGE && oldest && (
          <a
            href={`?before=${encodeURIComponent(oldest.occurred_at)}`}
            className="mx-auto block w-fit rounded-xl border border-zinc-200 bg-white px-4 py-2 text-[13px] font-medium text-zinc-700 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
          >
            Load older
          </a>
        )}
      </main>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function groupByLocalDay(rows: EventRow[]): Array<[string, EventRow[]]> {
  const map = new Map<string, EventRow[]>();
  for (const r of rows) {
    const d = new Date(r.occurred_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const arr = map.get(key) ?? [];
    arr.push(r);
    map.set(key, arr);
  }
  return [...map.entries()];
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function formatDayHeader(key: string): string {
  const d = new Date(`${key}T12:00:00`);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  if (isToday) return 'Today';
  if (isYesterday) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

// Human-readable names for the append-only event bus. Keeps the feed scannable.
const EVENT_LABEL: Record<string, string> = {
  'steps.ingested': 'Steps ingested',
  'sleep.ingested': 'Sleep ingested',
  'readiness.ingested': 'Readiness ingested',
  'nutrition.ingested': 'Nutrition ingested',
  'weight.ingested': 'Weight ingested',
  'waist.recorded': 'Waist recorded',
  'workout.logged': 'Workout logged',
  'alcohol.logged': 'Alcohol logged',
  'document.ingested': 'Document ingested',
  'daily.log_updated': 'Daily log updated',
  'daily.score_computed': 'Daily score computed',
  'streak.incremented': 'Streak incremented',
  'streak.broken': 'Streak broken',
  'comeback.detected': 'Comeback detected',
  'weekly.review_created': 'Weekly review created',
  'weekly.status_classified': 'Weekly status classified',
  'plateau.detected': 'Plateau detected',
  'plateau.escalated': 'Plateau escalated',
  'plateau.resolved': 'Plateau resolved',
  'adjustment.proposed': 'Adjustment proposed',
  'adjustment.decided': 'Adjustment decided',
  'reset.triggered': 'Reset triggered',
  'reset.acknowledged': 'Reset acknowledged',
  'reset.completed': 'Reset completed',
  'phase.transition_requested': 'Phase transition requested',
  'phase.transition_decided': 'Phase transition decided',
  'notification.scheduled': 'Notification scheduled',
  'notification.delivered': 'Notification delivered',
  'notification.suppressed': 'Notification suppressed',
  'milestone.awarded': 'Milestone awarded',
};

function humanEvent(t: string): string {
  return EVENT_LABEL[t] ?? t;
}

function renderPayload(e: EventRow) {
  const p = e.payload;
  if (!p) return null;

  // A few specific renderers for the important events; falls back to a compact kv list.
  if (e.event_type === 'daily.score_computed' && typeof p.score === 'number') {
    return (
      <p className="mt-0.5 text-[12px] text-zinc-500">
        Score {p.score}
        {typeof p.phase_mode === 'string' ? ` · ${p.phase_mode}` : ''}
      </p>
    );
  }
  if (e.event_type === 'adjustment.proposed') {
    const action = String((p as any).action ?? '');
    const reason = String((p as any).reason ?? '');
    return (
      <p className="mt-0.5 text-[12px] text-zinc-500">
        {action}{reason ? ` — ${reason}` : ''}
      </p>
    );
  }
  if (e.event_type === 'adjustment.decided') {
    return (
      <p className="mt-0.5 text-[12px] text-zinc-500">
        {String((p as any).decision ?? '')}
        {(p as any).action ? ` · ${(p as any).action}` : ''}
      </p>
    );
  }
  if (e.event_type === 'notification.delivered' || e.event_type === 'notification.suppressed') {
    return (
      <p className="mt-0.5 text-[12px] text-zinc-500">
        {String((p as any).kind ?? '')}
        {(p as any).reason ? ` · ${(p as any).reason}` : ''}
      </p>
    );
  }

  const entries = Object.entries(p);
  if (entries.length === 0) return null;
  const compact = entries.slice(0, 4).map(([k, v]) => `${k}=${safe(v)}`).join(' · ');
  return <p className="mt-0.5 text-[12px] tabular-nums text-zinc-500">{compact}</p>;
}

function safe(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 40);
  const s = String(v);
  return s.length > 40 ? s.slice(0, 37) + '…' : s;
}
