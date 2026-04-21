// ingest-oura
// Pulls Oura sleep + readiness (+ optional activity) for a date range and
// upserts them into sleep_records and oura_readiness. Idempotent per (user, day).
//
// Invoked by:
//   - pg_cron (hourly)
//   - manual POST { "days": 7 } for a backfill
//
// Secrets: OURA_PAT (Supabase env var).

import { primaryUser, serviceClient, todayISO, addDays } from '../_shared/db.ts';
import {
  fetchSleepSessions, fetchReadiness, fetchDailyActivity, primarySleepByDay,
} from '../_shared/oura.ts';

Deno.serve(async (req) => {
  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
  const daysBack: number = Math.min(Math.max(Number(body.days ?? 3), 1), 30);

  const db = serviceClient();
  const user = await primaryUser(db);
  const end = todayISO(user.timezone);
  const start = addDays(end, -daysBack);

  const status = { user_id: user.id, source: 'oura' as const, last_sync_attempt_at: new Date().toISOString() };

  try {
    const [sessions, readiness, activity] = await Promise.all([
      fetchSleepSessions(start, end),
      fetchReadiness(start, end),
      fetchDailyActivity(start, end).catch(() => [] /* steps optional — we prefer Apple Health */),
    ]);

    // Sleep: reduce multi-session days to primary sleep.
    const primary = primarySleepByDay(sessions);
    for (const [day, s] of primary) {
      await db.from('sleep_records').upsert({
        user_id: user.id,
        day,
        total_sleep_minutes: Math.round((s.total_sleep_duration ?? 0) / 60),
        efficiency_pct: s.efficiency ?? null,
        bedtime: s.bedtime_start,
        wake_time: s.bedtime_end,
        source: 'oura',
      }, { onConflict: 'user_id,day,source' });
    }

    for (const r of readiness) {
      await db.from('oura_readiness').upsert({
        user_id: user.id,
        day: r.day,
        readiness_score: r.score,
        temperature_deviation: r.temperature_deviation ?? null,
      }, { onConflict: 'user_id,day' });
    }

    // Oura steps are secondary — only fill when Apple Health hasn't.
    for (const a of activity) {
      const { data: existing } = await db.from('step_counts')
        .select('id').eq('user_id', user.id).eq('day', a.day)
        .eq('source', 'apple_health').maybeSingle();
      if (existing) continue;
      await db.from('step_counts').upsert({
        user_id: user.id, day: a.day, steps: a.steps, source: 'oura',
      }, { onConflict: 'user_id,day,source' });
    }

    await db.from('integration_status').upsert({
      ...status,
      last_success_at: new Date().toISOString(),
      last_error: null,
      consecutive_failures: 0,
      cursor: { last_ingested_day: end },
    });

    // Emit an ingestion event so "explain why adherence looks low" traces remain intact.
    await db.from('events').insert([
      { user_id: user.id, event_type: 'sleep.ingested', payload: { days: primary.size, start, end } },
      { user_id: user.id, event_type: 'readiness.ingested', payload: { days: readiness.length, start, end } },
    ]);

    return Response.json({
      ok: true, range: { start, end },
      counts: { sleep: primary.size, readiness: readiness.length, activity: activity.length },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.from('integration_status').upsert({
      ...status,
      last_error: msg,
      consecutive_failures: 1,
    });
    return new Response(`ingest-oura failed: ${msg}`, { status: 500 });
  }
});
