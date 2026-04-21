// notification-dispatcher
// Cron-invoked every 5 minutes. Reads scheduled notifications whose
// scheduled_for is in the past and fans each one out to BOTH channels
// (Telegram + Web Push) the user has enrolled. Enforces the ≤10/day cap.
//
// A notification counts as delivered the moment it lands on any channel;
// failing channels don't retry by themselves — the per-channel log lives
// in outbound_messages for Telegram and push_subscriptions.last_error for
// Push. Next run tries fresh.

import { serviceClient } from '../_shared/db.ts';
import { sendMessage } from '../_shared/telegram.ts';
import { sendWebPush } from '../_shared/webpush.ts';

const DAILY_CAP = 10;

interface PushSub { id: string; endpoint: string; p256dh: string; auth: string }

Deno.serve(async () => {
  const db = serviceClient();
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setUTCHours(0, 0, 0, 0);

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
    // Daily cap check.
    const { count } = await db.from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', n.user_id)
      .gte('delivered_at', todayStart.toISOString());
    if ((count ?? 0) >= DAILY_CAP) {
      await db.from('notifications').update({ suppressed_reason: 'daily_cap_reached' }).eq('id', n.id);
      await db.from('events').insert({
        user_id: n.user_id, event_type: 'notification.suppressed',
        payload: { id: n.id, kind: n.kind, reason: 'daily_cap_reached' },
      });
      suppressed++;
      continue;
    }

    const [{ data: user }, { data: subs }] = await Promise.all([
      db.from('users').select('telegram_chat_id').eq('id', n.user_id).single(),
      db.from('push_subscriptions').select('id,endpoint,p256dh,auth').eq('user_id', n.user_id),
    ]);

    const chatId = user?.telegram_chat_id as number | null | undefined;
    const pushSubs = (subs ?? []) as PushSub[];

    if (!chatId && pushSubs.length === 0) {
      await db.from('notifications').update({ suppressed_reason: 'no_delivery_channel' }).eq('id', n.id);
      suppressed++;
      continue;
    }

    const body = renderMessage(n.kind, n.payload);
    const deepLink = deepLinkFor(n.kind);
    const channelsReached: string[] = [];

    // Telegram.
    if (chatId) {
      try {
        await sendMessage(Number(chatId), body);
        await db.from('outbound_messages').insert({
          user_id: n.user_id, notification_id: n.id, body, payload: n.payload,
        });
        channelsReached.push('telegram');
      } catch (e) {
        console.error(`telegram ${n.id} failed:`, e);
      }
    }

    // Web Push fan-out.
    for (const sub of pushSubs) {
      const result = await sendWebPush(sub, JSON.stringify({
        title: titleFor(n.kind),
        body,
        url: deepLink,
        tag: n.kind,
      }));
      if (result.ok) {
        await db.from('push_subscriptions').update({
          last_delivered_at: new Date().toISOString(),
          consecutive_failures: 0, last_error: null,
        }).eq('id', sub.id);
        channelsReached.push('web_push');
      } else if (result.gone) {
        // Subscription revoked — drop it.
        await db.from('push_subscriptions').delete().eq('id', sub.id);
      } else {
        await db.from('push_subscriptions').update({
          last_error: `${result.status} ${result.body?.slice(0, 200) ?? ''}`,
          consecutive_failures: null as unknown as number, // bump handled below
        }).eq('id', sub.id);
        await db.rpc('increment_push_failure', { p_id: sub.id }).catch(() => {});
      }
    }

    if (channelsReached.length > 0) {
      await db.from('notifications').update({ delivered_at: new Date().toISOString() }).eq('id', n.id);
      await db.from('events').insert({
        user_id: n.user_id, event_type: 'notification.delivered',
        payload: { id: n.id, kind: n.kind, channels: channelsReached },
      });
      delivered++;
    } else {
      failed++;
    }
  }

  return Response.json({ delivered, suppressed, failed, considered: pending?.length ?? 0 });
});

function renderMessage(kind: string, payload: Record<string, unknown>): string {
  const m = (payload?.message as string | undefined);
  switch (kind) {
    case 'protein_anchor':     return m ?? '30–45g protein within 60 minutes of waking.';
    case 'step_momentum':      return m ?? 'Step momentum check — aim for the daily target.';
    case 'sleep_winddown':     return m ?? 'Wind-down window — lights low, screens off.';
    case 'weekly_summary':     return m ?? 'Weekly review is ready.';
    case 'regression_alert':   return m ?? 'Regression pattern detected — see Week.';
    case 'pattern_alert':      return m ?? 'Adherence trending low — consider a reset.';
    case 'reset_prompt':       return m ?? 'Reset protocol available — tap to acknowledge.';
    case 'adjustment_pending': return m ?? 'An adjustment is waiting for review.';
    default:                   return m ?? kind;
  }
}

function titleFor(kind: string): string {
  switch (kind) {
    case 'protein_anchor':     return 'Protein anchor';
    case 'step_momentum':      return 'Steps';
    case 'sleep_winddown':     return 'Wind-down';
    case 'weekly_summary':     return 'Weekly review';
    case 'regression_alert':   return 'Regression alert';
    case 'pattern_alert':      return 'Pattern alert';
    case 'reset_prompt':       return 'Reset available';
    case 'adjustment_pending': return 'Adjustment pending';
    default:                   return 'Healthwize';
  }
}

function deepLinkFor(kind: string): string {
  switch (kind) {
    case 'weekly_summary':
    case 'adjustment_pending':
    case 'regression_alert':
      return '/week';
    case 'reset_prompt':
    case 'pattern_alert':
      return '/';
    default:
      return '/';
  }
}
