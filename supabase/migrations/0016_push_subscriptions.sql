-- 0016_push_subscriptions.sql
-- Web Push subscriptions (VAPID / RFC 8292). One row per (user, endpoint).
-- Endpoint is unique per device — the browser mints a new one per install.
--
-- Notifications still flow through the `notifications` table; the dispatcher
-- reads both this table and `users.telegram_chat_id` and fans out to both.

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_delivered_at timestamptz,
  last_error text,
  consecutive_failures integer not null default 0,
  unique (user_id, endpoint)
);

alter table public.push_subscriptions enable row level security;
create policy push_subscriptions_owner on public.push_subscriptions
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create index on public.push_subscriptions (user_id);

-- Increment consecutive_failures atomically so the dispatcher can flag
-- dead subscriptions for later cleanup.
create or replace function public.increment_push_failure(p_id uuid)
returns void language sql security invoker
as $$
  update public.push_subscriptions
  set consecutive_failures = consecutive_failures + 1
  where id = p_id;
$$;
