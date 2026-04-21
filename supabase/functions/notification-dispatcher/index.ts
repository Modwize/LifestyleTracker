// notification-dispatcher
// Cron-invoked every 5 minutes. Reads scheduled notifications whose
// scheduled_for is in the past, sends via Telegram, marks delivered.
// Enforces the spec's ≤10/day cap as a late guard (the planner usually handles it).

import { serviceClient } from '../_shared/db.ts';
import { sendMessage } from '../_shared/telegram.ts';

const DAILY_CAP = 10;

Deno.serve(async () => {
  const db = serviceClient();
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setUTCHours(0, 0, 0, 0);

  // Pending notifications whose time has come.
  const { data: pending, error } = await db
    .from('notifications')
    .select('id, user_id, kind, scheduled_for, payload')
    .lte('scheduled_for', now.toISOString())
    .is('delivered_at', null)
    .is('suppressed_reason', null)
    .order('scheduled_for', { ascending: true })
    .limit(100);
  if (error) return new Response(`query failed: ${error.message}`, { status: 500 });

  let delivered = 0, suppressed = 0, failed = 0;

  for (const n of pending ?? []) {
    // Daily cap check (per user).
    const { count } = await db.from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', n.user_id)
      .gte('delivered_at', todayStart.toISOString());
    if ((count ?? 0) >= DAILY_CAP) {
      await db.from('notifications').update({
        suppressed_reason: 'daily_cap_reached',
      }).eq('id', n.id);
      await db.from('events').insert({
        user_id: n.user_id, event_type: 'notification.suppressed',
        payload: { id: n.id, kind: n.kind, reason: 'daily_cap_reached' },
      });
      suppressed++;
      continue;
    }

    const { data: user } = await db.from('users').select('telegram_chat_id')
      .eq('id', n.user_id).single();
    const chatId = user?.telegram_chat_id;
    if (!chatId) {
      await db.from('notifications').update({
        suppressed_reason: 'no_telegram_binding',
      }).eq('id', n.id);
      suppressed++;
      continue;
    }

    const body = renderMessage(n.kind, n.payload);
    try {
      await sendMessage(Number(chatId), body);
      await db.from('notifications').update({
        delivered_at: new Date().toISOString(),
      }).eq('id', n.id);
      await db.from('outbound_messages').insert({
        user_id: n.user_id, notification_id: n.id, body, payload: n.payload,
      });
      await db.from('events').insert({
        user_id: n.user_id, event_type: 'notification.delivered',
        payload: { id: n.id, kind: n.kind },
      });
      delivered++;
    } catch (e) {
      failed++;
      console.error(`deliver ${n.id} failed:`, e);
      // Leave delivered_at null so next run retries.
    }
  }

  return Response.json({ delivered, suppressed, failed, considered: pending?.length ?? 0 });
});

function renderMessage(kind: string, payload: Record<string, unknown>): string {
  const m = (payload?.message as string | undefined);
  switch (kind) {
    case 'protein_anchor':
      return m ?? '🥚 30–45g protein within 60 min of waking.';
    case 'step_momentum':
      return m ?? '👣 Step momentum check — how close to today\'s target?';
    case 'sleep_winddown':
      return m ?? '🌙 Wind-down window — lights low, screens off.';
    case 'weekly_summary':
      return m ?? '📊 Weekly review is ready. Send /week for the snapshot.';
    case 'regression_alert':
      return m ?? '⚠️ Regression pattern detected — /week for details.';
    case 'pattern_alert':
      return m ?? 'ℹ️ Adherence trending low — consider /reset ack.';
    case 'reset_prompt':
      return m ?? '🔁 Reset protocol available. /reset ack to activate.';
    case 'adjustment_pending':
      return m ?? '📌 An adjustment is waiting. /accept or /reject.';
    default:
      return m ?? `(${kind})`;
  }
}
