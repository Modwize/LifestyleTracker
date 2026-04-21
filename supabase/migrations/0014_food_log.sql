-- 0014_food_log.sql
-- Lightweight food scan log. NOT a nutrition tracker — this just records
-- barcode-resolved items with the user's compliance classification so we can:
--   (a) surface them on /today for context,
--   (b) learn which products the user treats as "on plan" vs "off",
--   (c) feed grocery suggestions later.
--
-- Macros are stored when Open Food Facts supplies them, but they don't flow
-- into adherence scoring. The existing nutrition_days row is still the source
-- of truth for daily compliance.

create table public.food_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  day date not null,
  scanned_at timestamptz not null default now(),
  barcode text,
  product_name text,
  brand text,
  serving_size text,
  calories numeric(7,1),
  protein_grams numeric(6,1),
  carb_grams numeric(6,1),
  fat_grams numeric(6,1),
  sugar_grams numeric(6,1),
  classification public.nutrition_compliance,
  source text not null default 'open_food_facts'
    check (source in ('open_food_facts','manual'))
);

alter table public.food_log enable row level security;
create policy food_log_owner on public.food_log
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create index on public.food_log (user_id, day desc);
create index on public.food_log (user_id, barcode);
