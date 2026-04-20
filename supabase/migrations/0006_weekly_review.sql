-- 0006_weekly_review.sql
-- Friday roll-up, plateau state, reset protocol, adjustments, notifications.

create type public.weekly_status as enum (
  'on_track',
  'plateau_watch',
  'plateau_confirmed',
  'regression',
  'recovery_advised',
  'simplify'
);

create type public.adjustment_action as enum (
  'continue',
  'simplify_plan',
  'suggest_adjustment',
  'behavioral_correction',
  'nutrition_adjustment',
  'movement_adjustment',
  'protocol_redesign',
  'recovery_mode',
  'reset_protocol'
);

create type public.adjustment_decision as enum ('pending','accepted','modified','rejected');

create table public.weekly_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  week_start_date date not null,                  -- Friday-anchored week start
  adherence_pct numeric(5,2),
  waist_change_inches numeric(5,2),
  weight_change_lbs numeric(5,2),
  sleep_minutes_avg integer,
  step_consistency_pct numeric(5,2),
  nutrition_compliance_ratio numeric(4,3),        -- fully+mostly / total days
  alcohol_drinks_total numeric(4,1),
  status public.weekly_status not null,
  summary_md text,                                 -- human-facing markdown
  computed_at timestamptz not null default now(),
  unique (user_id, week_start_date)
);

-- Plateau windowing. One active row at a time.
create table public.plateau_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  detected_on date not null,
  resolved_on date,
  weeks_in_plateau smallint not null default 1,
  last_rung_action public.adjustment_action,
  created_at timestamptz not null default now()
);

create unique index one_active_plateau_per_user
  on public.plateau_states (user_id) where resolved_on is null;

-- Reset Protocol. Triggered after 2–3 low-adherence days; requires ack.
create table public.reset_activations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  triggered_on date not null,
  trigger_signal jsonb not null,
  acknowledged_at timestamptz,
  completed_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

create unique index one_open_reset_per_user
  on public.reset_activations (user_id) where completed_at is null;

-- Coach adjustments. Every recommendation carries its provenance (spec: transparency).
create table public.adjustments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  weekly_review_id uuid references public.weekly_reviews(id) on delete set null,
  action public.adjustment_action not null,
  trigger_signal jsonb not null,         -- raw signals that fired the rule
  supporting_data jsonb not null,        -- metric snapshots (adherence %, waist Δ, etc.)
  reason text not null,                  -- plain-language rationale
  expected_outcome text not null,        -- what should change if accepted
  decision public.adjustment_decision not null default 'pending',
  decided_at timestamptz,
  modification_payload jsonb,            -- filled when decision = 'modified'
  created_at timestamptz not null default now()
);

create index on public.adjustments (user_id, decision, created_at desc);

-- Grocery hints, generated off last-week gaps + next-week targets.
create table public.grocery_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  week_start_date date not null,
  category text not null check (category in
    ('protein','vegetable','legume','hydration','recovery_food')),
  item text not null,
  rationale text,
  created_at timestamptz not null default now()
);

create index on public.grocery_suggestions (user_id, week_start_date);

-- Notifications are append-only; scheduler decides delivery.
create type public.notification_kind as enum (
  'protein_anchor',
  'step_momentum',
  'sleep_winddown',
  'weekly_summary',
  'regression_alert',
  'pattern_alert',
  'reset_prompt',
  'adjustment_pending'
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  kind public.notification_kind not null,
  scheduled_for timestamptz not null,
  delivered_at timestamptz,
  suppressed_reason text,                -- e.g. "daily_cap_reached"
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index on public.notifications (user_id, scheduled_for);
create index on public.notifications (user_id, kind, scheduled_for desc);
