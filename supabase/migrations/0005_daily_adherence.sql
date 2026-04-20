-- 0005_daily_adherence.sql
-- Daily-action log + deterministic daily adherence score.

-- What the coach expected today + what the user actually completed.
create table public.daily_logs (
  user_id uuid not null references public.users(id) on delete cascade,
  day date not null,
  -- Completion flags (nullable = "not yet evaluated"). The engine fills these.
  protein_breakfast_completed boolean,
  protein_breakfast_grams numeric(5,1),
  protein_breakfast_minutes_after_wake smallint,   -- <=60 counts
  steps_total integer,
  steps_target integer,
  steps_target_met boolean generated always as (
    case when steps_total is null or steps_target is null then null
         else steps_total >= steps_target end
  ) stored,
  sleep_minutes integer,
  sleep_threshold_minutes integer not null default 420,  -- 7h default
  sleep_threshold_met boolean generated always as (
    case when sleep_minutes is null then null
         else sleep_minutes >= sleep_threshold_minutes end
  ) stored,
  nutrition_compliance public.nutrition_compliance,
  workout_scheduled boolean not null default false,
  workout_completed boolean,
  cheat_day boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

-- Adaptive weight snapshot per day. Engine writes this; we keep weights auditable.
create table public.daily_adherence_scores (
  user_id uuid not null references public.users(id) on delete cascade,
  day date not null,
  score numeric(5,2) not null check (score between 0 and 100),
  -- Component contributions (0..1, pre-weight).
  nutrition_component numeric(3,2),
  protein_component   numeric(3,2),
  steps_component     numeric(3,2),
  sleep_component     numeric(3,2),
  workout_component   numeric(3,2),
  -- Weights actually used for this day (sum to 1.00 after phase adjustment).
  nutrition_weight numeric(3,2) not null,
  protein_weight   numeric(3,2) not null,
  steps_weight     numeric(3,2) not null,
  sleep_weight     numeric(3,2) not null,
  workout_weight   numeric(3,2) not null,
  phase_mode public.phase_mode not null default 'normal',
  computed_at timestamptz not null default now(),
  primary key (user_id, day)
);

-- 30-30-30 morning anchor: whitelist of accepted protein sources.
create table public.protein_sources (
  slug text primary key,
  label text not null,
  typical_grams smallint not null
);

insert into public.protein_sources (slug, label, typical_grams) values
  ('protein_shake','Protein shake',30),
  ('chicken','Chicken',35),
  ('salmon','Salmon',30),
  ('smoked_salmon','Smoked salmon',25),
  ('turkey','Turkey',30),
  ('greek_yogurt','Greek yogurt',20),
  ('eggs','Eggs (3 large)',21),
  ('cottage_cheese','Cottage cheese',25),
  ('lentils','Lentils',18),
  ('beans','Beans',15),
  ('leftover_protein','Leftover protein meal',30)
on conflict (slug) do nothing;

-- Streaks + comeback recognition.
create table public.streaks (
  user_id uuid primary key references public.users(id) on delete cascade,
  current_adherence_streak integer not null default 0,
  best_adherence_streak integer not null default 0,
  current_comeback_streak integer not null default 0,
  last_qualifying_day date,
  updated_at timestamptz not null default now()
);

create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  kind text not null,                        -- e.g. "phase_1_waist_hit", "first_30d_streak"
  achieved_on date not null,
  payload jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, kind, achieved_on)
);
