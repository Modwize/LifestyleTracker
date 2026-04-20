-- 0004_integrations.sql
-- Single-source-of-truth inbound signal tables.

create type public.data_source as enum (
  'apple_health',
  'oura',
  'myfitnesspal',
  'manual',
  'document'
);

-- Raw, deduplicated integration records. Downstream rollups read from here.
create table public.step_counts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  day date not null,
  steps integer not null check (steps >= 0),
  source public.data_source not null default 'apple_health',
  ingested_at timestamptz not null default now(),
  unique (user_id, day, source)
);

create table public.sleep_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  day date not null,                          -- sleep attributed to wake day
  total_sleep_minutes integer check (total_sleep_minutes >= 0),
  efficiency_pct numeric(4,1),
  bedtime timestamptz,
  wake_time timestamptz,
  source public.data_source not null default 'oura',
  ingested_at timestamptz not null default now(),
  unique (user_id, day, source)
);

create table public.oura_readiness (
  user_id uuid not null references public.users(id) on delete cascade,
  day date not null,
  readiness_score smallint check (readiness_score between 0 and 100),
  hrv_ms numeric,
  resting_hr smallint,
  temperature_deviation numeric,
  ingested_at timestamptz not null default now(),
  primary key (user_id, day)
);

create type public.nutrition_compliance as enum (
  'fully_compliant',
  'mostly_compliant',
  'off_plan_recovered',
  'off_plan'
);

create table public.nutrition_days (
  user_id uuid not null references public.users(id) on delete cascade,
  day date not null,
  calories integer,
  protein_grams numeric(6,1),
  carb_grams numeric(6,1),
  fat_grams numeric(6,1),
  compliance public.nutrition_compliance,
  source public.data_source not null default 'myfitnesspal',
  ingested_at timestamptz not null default now(),
  primary key (user_id, day)
);

-- Discrete workout log. "Scheduled" means coach expected it today.
create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  day date not null,
  scheduled boolean not null default false,
  completed boolean not null default false,
  duration_minutes integer,
  modality text,
  rehab boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);

create index on public.workouts (user_id, day);

-- Alcohol tracking, weekly-rolled. Stored at drink-event granularity.
create table public.alcohol_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  day date not null,
  drinks numeric(4,1) not null check (drinks > 0),
  context text,
  created_at timestamptz not null default now()
);

create index on public.alcohol_entries (user_id, day);

-- Document ingestion (labs, dietician plans).
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  kind text not null check (kind in ('lab_report','dietician_plan','other')),
  storage_path text not null,
  ingested_at timestamptz not null default now(),
  parsed jsonb
);
