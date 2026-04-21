// ingest-apple-health
// Endpoint for the iPhone Shortcut. Expects a POST with a shared secret header
// and a JSON body listing one or more days of HealthKit metrics.
//
// Shared secret flow:
//   - Set APPLE_SHORTCUT_SHARED_SECRET in Supabase env vars.
//   - The Shortcut sends it as header: X-Shortcut-Secret.
//
// Expected body:
//   {
//     "days": [
//       { "day": "2026-04-20", "steps": 7823, "sleep_minutes": 440, "weight_lbs": 216.2 }
//     ]
//   }

import { primaryUser, serviceClient } from '../_shared/db.ts';

interface Payload {
  days: Array<{
    day: string;
    steps?: number | null;
    sleep_minutes?: number | null;
    weight_lbs?: number | null;
  }>;
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('APPLE_SHORTCUT_SHARED_SECRET');
  if (!secret) return new Response('not configured', { status: 500 });
  if (req.headers.get('x-shortcut-secret') !== secret) {
    return new Response('forbidden', { status: 403 });
  }

  const body = await req.json().catch(() => null) as Payload | null;
  if (!body?.days?.length) return new Response('empty payload', { status: 400 });

  const db = serviceClient();
  const user = await primaryUser(db);

  await db.from('inbound_webhooks').insert({
    source: 'apple_shortcut', body: body as unknown as Record<string, unknown>,
    user_id: user.id,
  });

  let steps = 0, sleeps = 0, weights = 0;

  for (const d of body.days) {
    if (!d.day) continue;

    if (typeof d.steps === 'number') {
      await db.from('step_counts').upsert({
        user_id: user.id, day: d.day, steps: Math.max(0, Math.round(d.steps)),
        source: 'apple_health',
      }, { onConflict: 'user_id,day,source' });
      steps++;
    }

    // Apple sleep is a fallback when Oura hasn't synced — only insert if missing.
    if (typeof d.sleep_minutes === 'number') {
      const { data: existing } = await db.from('sleep_records')
        .select('id').eq('user_id', user.id).eq('day', d.day)
        .eq('source', 'oura').maybeSingle();
      if (!existing) {
        await db.from('sleep_records').upsert({
          user_id: user.id, day: d.day,
          total_sleep_minutes: Math.max(0, Math.round(d.sleep_minutes)),
          source: 'apple_health',
        }, { onConflict: 'user_id,day,source' });
        sleeps++;
      }
    }

    if (typeof d.weight_lbs === 'number') {
      await db.from('weight_measurements').upsert({
        user_id: user.id, measured_on: d.day,
        weight_lbs: d.weight_lbs, source: 'apple_health',
      }, { onConflict: 'user_id,measured_on,source' });
      weights++;
    }
  }

  await db.from('events').insert({
    user_id: user.id,
    event_type: 'steps.ingested',
    payload: { source: 'apple_health', days: body.days.length, steps_written: steps, sleeps_written: sleeps, weights_written: weights },
  });

  await db.from('integration_status').upsert({
    user_id: user.id, source: 'apple_health',
    last_sync_attempt_at: new Date().toISOString(),
    last_success_at: new Date().toISOString(),
    consecutive_failures: 0,
  });

  return Response.json({ ok: true, steps, sleeps, weights });
});
