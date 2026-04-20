-- 0003_measurements.sql
-- Weekly body measurements. Friday protocol: 2 readings, store both + average.

create table public.waist_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  measured_on date not null,                        -- Friday morning
  reading_1_inches numeric(5,2) not null,
  reading_2_inches numeric(5,2) not null,
  average_inches numeric(5,2)
    generated always as ((reading_1_inches + reading_2_inches) / 2.0) stored,
  protocol_notes text,                              -- e.g. "relaxed, after exhale, navel"
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  unique (user_id, measured_on)
);

create table public.weight_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  measured_on date not null,
  weight_lbs numeric(6,2) not null,
  source text not null default 'manual' check (source in ('manual','apple_health')),
  created_at timestamptz not null default now(),
  unique (user_id, measured_on, source)
);

-- Derived: waist-to-height ratio per measurement. Cheap enough to persist.
create view public.waist_to_height_trend as
  select
    w.user_id,
    w.measured_on,
    w.average_inches as waist_inches,
    u.height_inches,
    round((w.average_inches / u.height_inches)::numeric, 3) as ratio
  from public.waist_measurements w
  join public.users u on u.id = w.user_id;

create table public.bloodwork_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  drawn_on date not null,
  marker text not null,
  value numeric,
  unit text,
  reference_low numeric,
  reference_high numeric,
  flag text check (flag in ('low','normal','high','critical') or flag is null),
  lab_name text,
  created_at timestamptz not null default now(),
  unique (user_id, drawn_on, marker)
);
