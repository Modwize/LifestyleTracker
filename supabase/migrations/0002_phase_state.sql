-- 0002_phase_state.sql
-- Recovery-aware timeline. Phase changes gate step targets and score weights.

create type public.phase_mode as enum (
  'normal',
  'pre_surgery',
  'post_surgery',
  'rehab',
  'newborn_disruption',
  'return_to_build'
);

create type public.transition_decision as enum ('pending','approved','rejected');

-- Exactly one active phase at a time (enforced by partial unique index).
create table public.phase_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  mode public.phase_mode not null default 'normal',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  note text,
  -- Per-phase multipliers applied at score time.
  step_weight_multiplier numeric(3,2) not null default 1.00,
  workout_weight_multiplier numeric(3,2) not null default 1.00,
  sleep_weight_multiplier numeric(3,2) not null default 1.00,
  nutrition_weight_multiplier numeric(3,2) not null default 1.00,
  created_at timestamptz not null default now()
);

create unique index one_active_phase_per_user
  on public.phase_states (user_id) where ended_at is null;

-- Pending transitions require explicit confirmation before flipping the phase.
create table public.phase_transition_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  from_mode public.phase_mode not null,
  to_mode public.phase_mode not null,
  trigger_signal jsonb not null,
  reason text not null,
  expected_outcome text,
  decision public.transition_decision not null default 'pending',
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create index on public.phase_transition_requests (user_id, decision);

-- Step progression. Targets walk up through Phase 1 and auto-compress in recovery modes.
create table public.step_progression_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  phase smallint not null,
  week_in_phase smallint not null,
  step_target integer not null,
  effective_from date not null,
  effective_to date,
  created_at timestamptz not null default now()
);

create index on public.step_progression_plans (user_id, effective_from desc);
