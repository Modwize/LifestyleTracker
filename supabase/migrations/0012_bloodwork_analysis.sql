-- 0012_bloodwork_analysis.sql
-- Bloodwork extraction pipeline + canonical marker registry + trend views.
--
-- Per spec: bloodwork is periodic (every 4–6 months) and does NOT feed weekly
-- adjustment decisions. It produces a read-only constraint map; all effects on
-- coaching require explicit user action (same pattern as phase transitions).

-- Every marker a lab might report, mapped to a LOINC code when possible.
-- Seeded by supabase/seeds/0002_canonical_markers.sql.
create table public.canonical_markers (
  id serial primary key,
  slug text unique not null,             -- stable identifier: 'hba1c', 'apo_b', etc.
  display_name text not null,
  loinc_code text,                       -- optional; not every lab uses LOINC
  panel text not null check (panel in (
    'metabolic','lipid','thyroid','hormone','inflammation',
    'liver','kidney','cbc','nutrients','advanced','other'
  )),
  unit_default text,
  aliases text[] not null default '{}',  -- alternative names the LLM maps to this marker
  derived boolean not null default false,
  derivation_formula text,               -- human-readable formula when derived = true
  sort_order smallint not null default 0
);

create index on public.canonical_markers (panel, sort_order);

-- One row per lab draw (= one PDF upload). Holds extraction state + provenance.
create type public.extraction_state as enum (
  'uploaded','extracting','review','confirmed','failed'
);

create table public.lab_draws (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  drawn_on date,
  lab_name text,
  document_id uuid references public.documents(id) on delete set null,
  storage_bucket text not null default 'lab-reports',
  storage_path text not null,            -- path inside the private bucket
  state public.extraction_state not null default 'uploaded',
  extraction_payload jsonb,              -- raw LLM response, for audit
  extraction_model text,                 -- 'claude-sonnet-4-6' etc.
  extraction_error text,
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.lab_draws enable row level security;
create policy lab_draws_owner on public.lab_draws
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create index on public.lab_draws (user_id, created_at desc);
create index on public.lab_draws (user_id, state);

-- Existing bloodwork_results gains two fields: the canonical marker FK
-- (for trend grouping across draws) and the source draw FK.
alter table public.bloodwork_results
  add column canonical_marker_id integer references public.canonical_markers(id) on delete set null,
  add column raw_marker_text text,
  add column draw_id uuid references public.lab_draws(id) on delete cascade;

create index on public.bloodwork_results (user_id, canonical_marker_id, drawn_on);
create index on public.bloodwork_results (draw_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Derived markers. Computed in SQL so they show up in the UI next to their
-- source markers. Add more formulas as rows in canonical_markers + clauses here.

-- HOMA-IR = (fasting_glucose_mg_dl × fasting_insulin_uIU_ml) / 405
create or replace view public.derived_homa_ir as
  select
    g.user_id, g.drawn_on, g.draw_id,
    'homa_ir' as slug,
    round(((g.value * i.value) / 405.0)::numeric, 2) as value,
    null::text as unit
  from public.bloodwork_results g
  join public.canonical_markers cg on cg.id = g.canonical_marker_id and cg.slug = 'fasting_glucose'
  join public.bloodwork_results i on i.user_id = g.user_id and i.drawn_on = g.drawn_on
  join public.canonical_markers ci on ci.id = i.canonical_marker_id and ci.slug = 'fasting_insulin'
  where g.value is not null and i.value is not null;

-- TC / HDL ratio — cardiovascular risk indicator.
create or replace view public.derived_tc_hdl_ratio as
  select
    tc.user_id, tc.drawn_on, tc.draw_id,
    'tc_hdl_ratio' as slug,
    round((tc.value / nullif(hdl.value, 0))::numeric, 2) as value,
    null::text as unit
  from public.bloodwork_results tc
  join public.canonical_markers ctc on ctc.id = tc.canonical_marker_id and ctc.slug = 'total_cholesterol'
  join public.bloodwork_results hdl on hdl.user_id = tc.user_id and hdl.drawn_on = tc.drawn_on
  join public.canonical_markers chdl on chdl.id = hdl.canonical_marker_id and chdl.slug = 'hdl_cholesterol'
  where tc.value is not null and hdl.value is not null;

-- TG / HDL ratio — insulin sensitivity proxy.
create or replace view public.derived_tg_hdl_ratio as
  select
    tg.user_id, tg.drawn_on, tg.draw_id,
    'tg_hdl_ratio' as slug,
    round((tg.value / nullif(hdl.value, 0))::numeric, 2) as value,
    null::text as unit
  from public.bloodwork_results tg
  join public.canonical_markers ctg on ctg.id = tg.canonical_marker_id and ctg.slug = 'triglycerides'
  join public.bloodwork_results hdl on hdl.user_id = tg.user_id and hdl.drawn_on = tg.drawn_on
  join public.canonical_markers chdl on chdl.id = hdl.canonical_marker_id and chdl.slug = 'hdl_cholesterol'
  where tg.value is not null and hdl.value is not null;

-- non-HDL cholesterol (often absent from basic panels; always computable).
create or replace view public.derived_non_hdl as
  select
    tc.user_id, tc.drawn_on, tc.draw_id,
    'non_hdl_cholesterol' as slug,
    (tc.value - hdl.value) as value,
    'mg/dL' as unit
  from public.bloodwork_results tc
  join public.canonical_markers ctc on ctc.id = tc.canonical_marker_id and ctc.slug = 'total_cholesterol'
  join public.bloodwork_results hdl on hdl.user_id = tc.user_id and hdl.drawn_on = tc.drawn_on
  join public.canonical_markers chdl on chdl.id = hdl.canonical_marker_id and chdl.slug = 'hdl_cholesterol'
  where tc.value is not null and hdl.value is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- Trend view: every measurement per (user, marker) with Δ vs. prior draw.
-- The UI reads from here for marker trend cards.
create or replace view public.marker_trend as
  select
    br.user_id,
    br.canonical_marker_id,
    cm.slug,
    cm.display_name,
    cm.panel,
    br.drawn_on,
    br.value,
    br.unit,
    br.flag,
    br.reference_low,
    br.reference_high,
    (br.value - lag(br.value) over w) as delta,
    lag(br.value) over w as previous_value,
    row_number() over (partition by br.user_id, br.canonical_marker_id order by br.drawn_on desc) as recency_rank
  from public.bloodwork_results br
  join public.canonical_markers cm on cm.id = br.canonical_marker_id
  where br.canonical_marker_id is not null and br.value is not null
  window w as (partition by br.user_id, br.canonical_marker_id order by br.drawn_on);

-- Latest value per marker per user — used by /labs dashboard.
create or replace view public.latest_markers as
  select distinct on (user_id, canonical_marker_id)
    user_id, canonical_marker_id, slug, display_name, panel,
    drawn_on, value, unit, flag, reference_low, reference_high, delta, previous_value
  from public.marker_trend
  order by user_id, canonical_marker_id, drawn_on desc;

-- ─────────────────────────────────────────────────────────────────────────────
-- canonical_markers is shared reference data — readable by any authed user.
alter table public.canonical_markers enable row level security;
create policy canonical_markers_read on public.canonical_markers
  for select using (auth.role() = 'authenticated');
