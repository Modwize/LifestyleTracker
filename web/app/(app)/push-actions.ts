'use server';

// Save / remove a Web Push subscription for the current user.
// The client calls these after successful Push API subscribe/unsubscribe.

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function savePushSubscription(payload: {
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent?: string;
}): Promise<{ ok: boolean }> {
  const db = createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/login');

  await db.from('push_subscriptions').upsert({
    user_id: user.id,
    endpoint: payload.endpoint,
    p256dh: payload.p256dh,
    auth: payload.auth,
    user_agent: payload.user_agent ?? null,
    consecutive_failures: 0,
    last_error: null,
  }, { onConflict: 'user_id,endpoint' });

  revalidatePath('/');
  return { ok: true };
}

export async function removePushSubscription(endpoint: string): Promise<{ ok: boolean }> {
  const db = createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/login');

  await db.from('push_subscriptions').delete()
    .eq('user_id', user.id).eq('endpoint', endpoint);

  revalidatePath('/');
  return { ok: true };
}
