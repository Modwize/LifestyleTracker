-- 0009_integrations.sql
-- Per-user integration bindings + sync cursors + inbound webhook log.
-- All integration secrets live in Supabase env vars — never in the DB.

alter table public.users
  add column telegram_chat_id bigint,
  add column telegram_username text;

-- One-way binding: chat_id → user_id. Used by the telegram-webhook edge function.
create unique index if not exists users_telegram_chat_id_idx
  on public.users (telegram_chat_id) where telegram_chat_id is not null;

-- Per-source cursor + health. Read by the ingest functions to avoid redundant pulls.
create table public.integration_status (
  user_id uuid not null references public.users(id) on delete cascade,
  source public.data_source not null,
  last_sync_attempt_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  consecutive_failures integer not null default 0,
  cursor jsonb,                                -- e.g. {"last_ingested_day": "2026-04-19"}
  primary key (user_id, source)
);

alter table public.integration_status enable row level security;
create policy integration_status_owner on public.integration_status
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Append-only log of inbound webhook deliveries (telegram / apple shortcut / oura).
-- Indexed by source so we can replay failed deliveries.
-- Intentionally service-role only (no RLS policy) — contains raw payloads.
create table public.inbound_webhooks (
  id bigserial primary key,
  source text not null check (source in ('telegram','apple_shortcut','oura','other')),
  received_at timestamptz not null default now(),
  request_ip text,
  headers jsonb,
  body jsonb,
  processed_at timestamptz,
  processing_error text,
  user_id uuid references public.users(id) on delete set null
);

create index on public.inbound_webhooks (source, received_at desc);
create index on public.inbound_webhooks (user_id, received_at desc);

-- Outbound bot messages log. Useful for debugging and the "explain" view.
create table public.outbound_messages (
  id bigserial primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  channel text not null default 'telegram',
  sent_at timestamptz not null default now(),
  notification_id uuid references public.notifications(id) on delete set null,
  body text not null,
  payload jsonb
);

alter table public.outbound_messages enable row level security;
create policy outbound_messages_owner on public.outbound_messages
  using (user_id = auth.uid());

create index on public.outbound_messages (user_id, sent_at desc);
