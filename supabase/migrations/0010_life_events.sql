-- 0010_life_events.sql
-- Life-event markers that can drive phase transitions (spec: life-event awareness).
-- Every phase change is still manual-approval via phase_transition_requests; this
-- table only records the event itself so the transition engine has something to
-- reason over.

create type public.life_event_kind as enum (
  'surgery_scheduled',
  'surgery_completed',
  'pt_cleared_for_rehab',
  'rehab_completed',
  'newborn_arrival',
  'travel_disruption',
  'other'
);

create table public.life_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  kind public.life_event_kind not null,
  event_date date not null,
  note text,
  payload jsonb,
  created_at timestamptz not null default now()
);

alter table public.life_events enable row level security;
create policy life_events_owner on public.life_events
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create index on public.life_events (user_id, event_date desc);
create index on public.life_events (user_id, kind);
