// Supabase service-role client for edge functions.
// Edge functions bypass RLS by design (they act as the backend) so we can
// safely query across the user row.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export function serviceClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set');
  return createClient(url, key, { auth: { persistSession: false } });
}

// For N=1 we have a single user. Telegram webhook resolves by chat_id;
// schedulers resolve by "the user". This helper returns the one row.
export async function primaryUser(db: SupabaseClient): Promise<{
  id: string;
  timezone: string;
  telegram_chat_id: number | null;
  wake_window_start: string;
  check_in_weekday: number;
}> {
  const { data, error } = await db
    .from('users')
    .select('id,timezone,telegram_chat_id,wake_window_start,check_in_weekday')
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  if (error || !data) throw new Error(`primaryUser lookup failed: ${error?.message}`);
  return data;
}

export async function resolveUserByChatId(
  db: SupabaseClient,
  chatId: number,
): Promise<string | null> {
  const { data } = await db.from('users').select('id').eq('telegram_chat_id', chatId).maybeSingle();
  return data?.id ?? null;
}

export function todayISO(tz = 'America/New_York'): string {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return fmt.format(now); // YYYY-MM-DD
}

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
