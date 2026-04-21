-- supabase/cron.sql
-- Run this in the Supabase SQL Editor once, AFTER deploying all edge functions.
-- Requires pg_cron + pg_net extensions (both available on Supabase).
--
-- Replace the two placeholders with your project values, then run:
--   :project_ref     — e.g. "abcdefghij" from https://<ref>.supabase.co
--   :service_role    — service role JWT (Settings → API → service_role key)
--
-- pg_cron runs jobs in UTC. Times below are EST/EDT-aware.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- 1) Store secrets in supabase_vault (encrypted). Run ONCE, replacing values:
--    select vault.create_secret('https://YOUR_REF.supabase.co', 'project_url');
--    select vault.create_secret('eyJ...SERVICE_ROLE_JWT...',    'service_role');
--
-- 2) Helper reads those secrets and posts to an edge function.
create schema if not exists private;

create or replace function private.invoke_edge(fn text, body jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_key text;
  req_id bigint;
begin
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_key
    from vault.decrypted_secrets where name = 'service_role';
  if v_url is null or v_key is null then
    raise exception 'project_url or service_role secret missing in vault';
  end if;
  select net.http_post(
    url := v_url || '/functions/v1/' || fn,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := body
  ) into req_id;
  return req_id;
end$$;

-- ======================================================================
-- Schedules (pg_cron runs in UTC)
-- ======================================================================

-- Hourly: pull Oura (last 3 days, idempotent).
select cron.schedule(
  'oura-hourly', '7 * * * *',
  $$ select private.invoke_edge('ingest-oura', jsonb_build_object('days', 3)); $$
);

-- Every 5 minutes: fan out due notifications via Telegram.
select cron.schedule(
  'notifications-every-5m', '*/5 * * * *',
  $$ select private.invoke_edge('notification-dispatcher'); $$
);

-- Daily 08:05 UTC (≈04:05 EDT / 03:05 EST) — compute yesterday's score.
select cron.schedule(
  'daily-rollup-overnight', '5 8 * * *',
  $$ select private.invoke_edge('daily-rollup'); $$
);

-- Friday 12:00 UTC (≈08:00 EDT / 07:00 EST) — weekly review.
select cron.schedule(
  'weekly-review-friday', '0 12 * * 5',
  $$ select private.invoke_edge('weekly-review'); $$
);

-- List installed jobs:
--   select jobid, jobname, schedule, command from cron.job order by jobname;
-- Unschedule:
--   select cron.unschedule('oura-hourly');
