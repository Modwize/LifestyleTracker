-- 0007_events.sql
-- Append-only event bus. Every signal, completion, and coach decision lands here.
-- Powers replay, audit, and the "adjustment transparency" requirement.

create type public.event_type as enum (
  -- ingestion
  'steps.ingested',
  'sleep.ingested',
  'readiness.ingested',
  'nutrition.ingested',
  'weight.ingested',
  'waist.recorded',
  'workout.logged',
  'alcohol.logged',
  'document.ingested',
  -- daily lifecycle
  'daily.log_updated',
  'daily.score_computed',
  'streak.incremented',
  'streak.broken',
  'comeback.detected',
  -- weekly lifecycle
  'weekly.review_created',
  'weekly.status_classified',
  'plateau.detected',
  'plateau.escalated',
  'plateau.resolved',
  -- coach actions
  'adjustment.proposed',
  'adjustment.decided',
  'reset.triggered',
  'reset.acknowledged',
  'reset.completed',
  'phase.transition_requested',
  'phase.transition_decided',
  'notification.scheduled',
  'notification.delivered',
  'notification.suppressed',
  'milestone.awarded'
);

create table public.events (
  id bigserial primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  event_type public.event_type not null,
  occurred_at timestamptz not null default now(),
  -- Optional foreign-object pointers. Keeps replay cheap.
  subject_day date,
  subject_week_start date,
  subject_id uuid,
  payload jsonb not null default '{}'::jsonb,
  -- Causation chain: which earlier event produced this one?
  caused_by_event_id bigint references public.events(id) on delete set null,
  created_at timestamptz not null default now()
);

create index on public.events (user_id, occurred_at desc);
create index on public.events (user_id, event_type, occurred_at desc);
create index on public.events (user_id, subject_day);
create index on public.events (user_id, subject_week_start);

-- Snapshots stored after each rollup. Makes "explain why" queries O(1).
create table public.signal_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  snapshot_on date not null,
  scope text not null check (scope in ('daily','weekly')),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, snapshot_on, scope)
);
