-- 0001_core_identity.sql
-- Users, baseline profile, settings, waist-target ladder.

create extension if not exists "pgcrypto";

-- System identity + immutable baseline captured at onboarding.
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  height_inches numeric(5,2) not null,
  wake_window_start time not null default '07:00',
  wake_window_end   time not null default '08:30',
  work_start        time not null default '09:00',
  work_end          time not null default '17:30',
  measurement_location text not null default 'navel',
  check_in_weekday smallint not null default 5 check (check_in_weekday between 0 and 6), -- 5 = Friday
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Starting values preserved for trend math. Never mutated after onboarding.
create table public.user_baselines (
  user_id uuid primary key references public.users(id) on delete cascade,
  weight_lbs numeric(6,2) not null,
  waist_inches numeric(5,2) not null,
  waist_to_height_ratio numeric(5,3) generated always as (waist_inches / nullif(height_inches_cache, 0)) stored,
  height_inches_cache numeric(5,2) not null,
  daily_steps_baseline integer not null default 3000,
  training_experience text not null default 'advanced',
  injury_status text,
  captured_at timestamptz not null default now()
);

-- Tunable preferences that can drift over time.
create table public.user_settings (
  user_id uuid primary key references public.users(id) on delete cascade,
  alcohol_soft_cap_week smallint not null default 4,
  alcohol_hard_cap_week smallint not null default 6,
  max_daily_notifications smallint not null default 10,
  cheat_day_weekday smallint check (cheat_day_weekday between 0 and 6),
  cheat_day_mode text not null default 'weekly_unrestricted'
    check (cheat_day_mode in ('weekly_unrestricted','adaptive_refeed','disabled')),
  gamification_enabled boolean not null default true,
  social_sharing_enabled boolean not null default false, -- spec says avoid
  updated_at timestamptz not null default now()
);

-- Phase-1 → Optimal waist ladder. Stored per user so it can be re-parameterised.
create table public.waist_target_ladder (
  user_id uuid not null references public.users(id) on delete cascade,
  phase smallint not null check (phase between 1 and 4),
  target_waist_inches numeric(5,2) not null,
  label text not null,
  primary key (user_id, phase)
);

create index on public.users (timezone);
