// telegram-webhook
// Single entry point for the Telegram bot. Validates Telegram's secret-token
// header, parses the update, dispatches to a command handler.
//
// Commands:
//   /start               Bind this chat to the primary user (one-time).
//   /help                List commands.
//   /today               Today's actions + current week adherence.
//   /week                Weekly snapshot + latest review status.
//   /nutrition <level>   Set today's nutrition compliance (fully|mostly|recovered|off).
//   /protein <grams> [min_after_wake]   Log 30-30-30 anchor.
//   /steps <n>           Manual override for today's steps.
//   /sleep <minutes>     Manual override for today's sleep.
//   /waist <r1> <r2>     Friday waist protocol — stores both readings + average.
//   /weight <lbs>        Manual weight entry.
//   /drink <n> [note]    Add n alcoholic drinks to today.
//   /workout done|skip   Log today's workout outcome.
//   /cheat on|off        Mark today as a cheat day.
//   /surgery <YYYY-MM-DD>  Record surgery date → proposes pre→post phase transition.
//   /accept /reject      Decide the latest pending adjustment.
//   /reset ack           Acknowledge the open reset protocol.

import { serviceClient, resolveUserByChatId, todayISO } from '../_shared/db.ts';
import { sendMessage, validateWebhookSecret, TelegramUpdate } from '../_shared/telegram.ts';

const COMPLIANCE_MAP: Record<string, string> = {
  fully: 'fully_compliant',
  mostly: 'mostly_compliant',
  recovered: 'off_plan_recovered',
  off: 'off_plan',
};

Deno.serve(async (req) => {
  if (!validateWebhookSecret(req)) return new Response('forbidden', { status: 403 });

  const update = await req.json() as TelegramUpdate;
  const db = serviceClient();

  await db.from('inbound_webhooks').insert({
    source: 'telegram', body: update as unknown as Record<string, unknown>,
    headers: Object.fromEntries(req.headers),
  });

  const msg = update.message;
  if (!msg?.text || msg.chat.type !== 'private') return new Response('ok');

  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const [cmdRaw, ...args] = text.split(/\s+/);
  const cmd = cmdRaw.toLowerCase().replace(/^\//, '').replace(/@\w+$/, '');

  try {
    if (cmd === 'start') return await handleStart(db, msg, chatId);

    const userId = await resolveUserByChatId(db, chatId);
    if (!userId) {
      await sendMessage(chatId, 'This chat is not linked. Send /start first.');
      return new Response('ok');
    }

    switch (cmd) {
      case 'help':       return await handleHelp(chatId);
      case 'today':      return await handleToday(db, userId, chatId);
      case 'week':       return await handleWeek(db, userId, chatId);
      case 'nutrition':  return await handleNutrition(db, userId, chatId, args);
      case 'protein':    return await handleProtein(db, userId, chatId, args);
      case 'steps':      return await handleSteps(db, userId, chatId, args);
      case 'sleep':      return await handleSleep(db, userId, chatId, args);
      case 'waist':      return await handleWaist(db, userId, chatId, args);
      case 'weight':     return await handleWeight(db, userId, chatId, args);
      case 'drink':      return await handleDrink(db, userId, chatId, args);
      case 'workout':    return await handleWorkout(db, userId, chatId, args);
      case 'cheat':      return await handleCheat(db, userId, chatId, args);
      case 'surgery':    return await handleSurgery(db, userId, chatId, args);
      case 'accept':
      case 'reject':     return await handleAdjustmentDecision(db, userId, chatId, cmd);
      case 'reset':      return await handleResetAck(db, userId, chatId, args);
      default:
        await sendMessage(chatId, `Unknown command: /${cmd}\nSend /help for the list.`);
    }
  } catch (e) {
    const emsg = e instanceof Error ? e.message : String(e);
    await sendMessage(chatId, `Error handling /${cmd}: ${emsg}`);
  }

  return new Response('ok');
});

// -----------------------------------------------------------------------------
// Handlers
// -----------------------------------------------------------------------------

async function handleStart(db: any, msg: NonNullable<TelegramUpdate['message']>, chatId: number) {
  // Bind chat to the single user row. Guards against accidental cross-binding.
  const { data: already } = await db.from('users').select('id').eq('telegram_chat_id', chatId).maybeSingle();
  if (already) {
    await sendMessage(chatId, 'Already linked. Send /today or /help.');
    return new Response('ok');
  }
  const { data: user } = await db.from('users').select('id,telegram_chat_id')
    .order('created_at', { ascending: true }).limit(1).single();
  if (!user) {
    await sendMessage(chatId, 'No user profile found. Seed the DB first.');
    return new Response('ok');
  }
  if (user.telegram_chat_id && user.telegram_chat_id !== chatId) {
    await sendMessage(chatId, 'This user is already bound to a different chat. Contact the admin.');
    return new Response('ok');
  }
  await db.from('users').update({
    telegram_chat_id: chatId,
    telegram_username: msg.from.username ?? null,
  }).eq('id', user.id);
  await sendMessage(chatId,
    `Linked. You'll get morning protein nudges, midday step checks, evening wind-down, and Friday weekly reviews here. Send /help anytime.`);
  return new Response('ok');
}

async function handleHelp(chatId: number) {
  await sendMessage(chatId, [
    'Commands:',
    '/today — today\'s actions + week adherence',
    '/week — weekly snapshot',
    '/nutrition fully|mostly|recovered|off',
    '/protein <grams> [min_after_wake]',
    '/steps <n>, /sleep <minutes>',
    '/waist <r1> <r2>, /weight <lbs>',
    '/drink <n> [note]',
    '/workout done|skip',
    '/cheat on|off',
    '/surgery YYYY-MM-DD',
    '/accept | /reject — decide latest pending adjustment',
    '/reset ack — acknowledge the reset protocol',
  ].join('\n'));
  return new Response('ok');
}

async function handleToday(db: any, userId: string, chatId: number) {
  const { data: u } = await db.from('users').select('timezone').eq('id', userId).single();
  const day = todayISO(u?.timezone ?? 'America/New_York');
  const { data: dl } = await db.from('daily_logs').select('*').eq('user_id', userId).eq('day', day).maybeSingle();
  const { data: score } = await db.from('daily_adherence_scores').select('score').eq('user_id', userId).eq('day', day).maybeSingle();
  const { data: week } = await db.from('current_week_adherence').select('*').eq('user_id', userId).maybeSingle();

  const protein = dl?.protein_breakfast_completed == null ? '—' : dl.protein_breakfast_completed ? '✓' : '✗';
  const steps = dl?.steps_total == null ? '—' : `${dl.steps_total}/${dl.steps_target ?? '?'}`;
  const sleep = dl?.sleep_minutes == null ? '—' : `${Math.floor(dl.sleep_minutes / 60)}h ${dl.sleep_minutes % 60}m`;
  const nut = dl?.nutrition_compliance ?? '—';
  const workout = dl?.workout_scheduled ? (dl.workout_completed ? '✓ done' : '⏳ scheduled') : 'none scheduled';

  await sendMessage(chatId, [
    `Today (${day})`,
    `Protein: ${protein}`,
    `Steps: ${steps}`,
    `Sleep: ${sleep}`,
    `Nutrition: ${nut}`,
    `Workout: ${workout}`,
    `Score: ${score?.score ?? '—'}`,
    ``,
    `Week adherence: ${week?.adherence_pct ?? '—'}%`,
  ].join('\n'));
  return new Response('ok');
}

async function handleWeek(db: any, userId: string, chatId: number) {
  const { data: snap } = await db.from('week_snapshot').select('*').eq('user_id', userId).maybeSingle();
  if (!snap) {
    await sendMessage(chatId, 'No weekly review yet. It runs Friday morning.');
    return new Response('ok');
  }
  await sendMessage(chatId, [
    `Week ${snap.week_start_date} — ${snap.status}`,
    `Adherence: ${snap.adherence_pct}%`,
    `Waist Δ: ${snap.waist_change_inches ?? '—'} in`,
    `Weight Δ: ${snap.weight_change_lbs ?? '—'} lbs`,
    `Sleep avg: ${Math.floor((snap.sleep_minutes_avg ?? 0) / 60)}h ${(snap.sleep_minutes_avg ?? 0) % 60}m`,
    `Step consistency: ${snap.step_consistency_pct}%`,
    `Nutrition compliance: ${((snap.nutrition_compliance_ratio ?? 0) * 100).toFixed(0)}%`,
    `Alcohol: ${snap.alcohol_drinks_total} drinks`,
  ].join('\n'));
  return new Response('ok');
}

async function handleNutrition(db: any, userId: string, chatId: number, args: string[]) {
  const level = COMPLIANCE_MAP[args[0]?.toLowerCase() ?? ''];
  if (!level) {
    await sendMessage(chatId, 'Usage: /nutrition fully|mostly|recovered|off');
    return new Response('ok');
  }
  const day = todayISO();
  await db.from('daily_logs').upsert({
    user_id: userId, day, nutrition_compliance: level, sleep_threshold_minutes: 450,
  }, { onConflict: 'user_id,day' });
  await db.from('nutrition_days').upsert({
    user_id: userId, day, compliance: level, source: 'manual',
  }, { onConflict: 'user_id,day' });
  await sendMessage(chatId, `Nutrition: ${level}.`);
  return new Response('ok');
}

async function handleProtein(db: any, userId: string, chatId: number, args: string[]) {
  const grams = Number(args[0]);
  const minsAfterWake = args[1] != null ? Number(args[1]) : null;
  if (!Number.isFinite(grams) || grams <= 0) {
    await sendMessage(chatId, 'Usage: /protein <grams> [min_after_wake]');
    return new Response('ok');
  }
  const day = todayISO();
  await db.from('daily_logs').upsert({
    user_id: userId, day,
    protein_breakfast_completed: true,
    protein_breakfast_grams: grams,
    protein_breakfast_minutes_after_wake: minsAfterWake,
    sleep_threshold_minutes: 450,
  }, { onConflict: 'user_id,day' });
  const note = minsAfterWake != null && minsAfterWake > 60 ? ' (late — compliance clamped)' : '';
  await sendMessage(chatId, `Protein logged: ${grams}g${minsAfterWake != null ? ` @ +${minsAfterWake}min` : ''}${note}.`);
  return new Response('ok');
}

async function handleSteps(db: any, userId: string, chatId: number, args: string[]) {
  const n = Number(args[0]);
  if (!Number.isFinite(n) || n < 0) {
    await sendMessage(chatId, 'Usage: /steps <total>');
    return new Response('ok');
  }
  const day = todayISO();
  await db.from('daily_logs').upsert({
    user_id: userId, day, steps_total: Math.round(n), sleep_threshold_minutes: 450,
  }, { onConflict: 'user_id,day' });
  await db.from('step_counts').upsert({
    user_id: userId, day, steps: Math.round(n), source: 'manual',
  }, { onConflict: 'user_id,day,source' });
  await sendMessage(chatId, `Steps: ${Math.round(n)}.`);
  return new Response('ok');
}

async function handleSleep(db: any, userId: string, chatId: number, args: string[]) {
  const mins = Number(args[0]);
  if (!Number.isFinite(mins) || mins < 0) {
    await sendMessage(chatId, 'Usage: /sleep <minutes>');
    return new Response('ok');
  }
  const day = todayISO();
  await db.from('daily_logs').upsert({
    user_id: userId, day, sleep_minutes: Math.round(mins), sleep_threshold_minutes: 450,
  }, { onConflict: 'user_id,day' });
  await sendMessage(chatId, `Sleep: ${Math.round(mins)}m.`);
  return new Response('ok');
}

async function handleWaist(db: any, userId: string, chatId: number, args: string[]) {
  const r1 = Number(args[0]);
  const r2 = Number(args[1]);
  if (!Number.isFinite(r1) || !Number.isFinite(r2)) {
    await sendMessage(chatId, 'Usage: /waist <reading1> <reading2>');
    return new Response('ok');
  }
  const day = todayISO();
  await db.from('waist_measurements').upsert({
    user_id: userId, measured_on: day,
    reading_1_inches: r1, reading_2_inches: r2,
    protocol_notes: 'navel, relaxed, post-exhale',
  }, { onConflict: 'user_id,measured_on' });
  const avg = Math.round(((r1 + r2) / 2) * 100) / 100;
  await sendMessage(chatId, `Waist: ${r1} / ${r2} → avg ${avg} in.`);
  return new Response('ok');
}

async function handleWeight(db: any, userId: string, chatId: number, args: string[]) {
  const lbs = Number(args[0]);
  if (!Number.isFinite(lbs) || lbs <= 0) {
    await sendMessage(chatId, 'Usage: /weight <lbs>');
    return new Response('ok');
  }
  const day = todayISO();
  await db.from('weight_measurements').upsert({
    user_id: userId, measured_on: day, weight_lbs: lbs, source: 'manual',
  }, { onConflict: 'user_id,measured_on,source' });
  await sendMessage(chatId, `Weight: ${lbs} lbs.`);
  return new Response('ok');
}

async function handleDrink(db: any, userId: string, chatId: number, args: string[]) {
  const n = Number(args[0]);
  const note = args.slice(1).join(' ') || null;
  if (!Number.isFinite(n) || n <= 0) {
    await sendMessage(chatId, 'Usage: /drink <n> [note]');
    return new Response('ok');
  }
  const day = todayISO();
  await db.from('alcohol_entries').insert({ user_id: userId, day, drinks: n, context: note });
  await sendMessage(chatId, `Logged ${n} drink${n === 1 ? '' : 's'}.`);
  return new Response('ok');
}

async function handleWorkout(db: any, userId: string, chatId: number, args: string[]) {
  const outcome = args[0]?.toLowerCase();
  if (!['done', 'skip', 'rehab'].includes(outcome)) {
    await sendMessage(chatId, 'Usage: /workout done|skip|rehab');
    return new Response('ok');
  }
  const day = todayISO();
  const completed = outcome === 'done' || outcome === 'rehab';
  await db.from('daily_logs').upsert({
    user_id: userId, day, workout_scheduled: true, workout_completed: completed,
    sleep_threshold_minutes: 450,
  }, { onConflict: 'user_id,day' });
  await db.from('workouts').insert({
    user_id: userId, day, scheduled: true, completed, rehab: outcome === 'rehab',
  });
  await sendMessage(chatId, `Workout: ${outcome}.`);
  return new Response('ok');
}

async function handleCheat(db: any, userId: string, chatId: number, args: string[]) {
  const on = args[0]?.toLowerCase() === 'on';
  const day = todayISO();
  await db.from('daily_logs').upsert({
    user_id: userId, day, cheat_day: on, sleep_threshold_minutes: 450,
  }, { onConflict: 'user_id,day' });
  await sendMessage(chatId, `Cheat day: ${on ? 'on' : 'off'}.`);
  return new Response('ok');
}

async function handleSurgery(db: any, userId: string, chatId: number, args: string[]) {
  const date = args[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) {
    await sendMessage(chatId, 'Usage: /surgery YYYY-MM-DD');
    return new Response('ok');
  }
  await db.from('life_events').insert({
    user_id: userId, kind: 'surgery_scheduled', event_date: date,
    note: 'Set via Telegram /surgery',
  });
  // Current phase is pre_surgery. Post-op transition is proposed the day of surgery.
  await db.from('phase_transition_requests').insert({
    user_id: userId,
    from_mode: 'pre_surgery',
    to_mode: 'post_surgery',
    trigger_signal: { surgery_date: date },
    reason: `Surgery scheduled for ${date}. Transition will be proposed on the day.`,
    expected_outcome: 'Workouts paused, nutrition/protein prioritised, sleep weight lifted.',
  });
  await sendMessage(chatId, `Surgery recorded for ${date}. I'll prompt you on the day to confirm the post_surgery transition.`);
  return new Response('ok');
}

async function handleAdjustmentDecision(db: any, userId: string, chatId: number, action: 'accept' | 'reject') {
  const { data: pending } = await db.from('adjustments')
    .select('id,action,reason').eq('user_id', userId).eq('decision', 'pending')
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!pending) {
    await sendMessage(chatId, 'No pending adjustment.');
    return new Response('ok');
  }
  await db.from('adjustments').update({
    decision: action === 'accept' ? 'accepted' : 'rejected',
    decided_at: new Date().toISOString(),
  }).eq('id', pending.id);
  await db.from('events').insert({
    user_id: userId, event_type: 'adjustment.decided',
    payload: { id: pending.id, decision: action, action: pending.action },
  });
  await sendMessage(chatId, `Adjustment ${action}ed: ${pending.action}.`);
  return new Response('ok');
}

async function handleResetAck(db: any, userId: string, chatId: number, args: string[]) {
  if (args[0]?.toLowerCase() !== 'ack') {
    await sendMessage(chatId, 'Usage: /reset ack');
    return new Response('ok');
  }
  const { data: open } = await db.from('reset_activations')
    .select('id').eq('user_id', userId).is('acknowledged_at', null).maybeSingle();
  if (!open) {
    await sendMessage(chatId, 'No open reset to acknowledge.');
    return new Response('ok');
  }
  await db.from('reset_activations').update({ acknowledged_at: new Date().toISOString() }).eq('id', open.id);
  await db.from('events').insert({
    user_id: userId, event_type: 'reset.acknowledged', payload: { id: open.id },
  });
  await sendMessage(chatId, 'Reset acknowledged. 48h: protein breakfast + hydration + simplified meals + sleep priority.');
  return new Response('ok');
}
