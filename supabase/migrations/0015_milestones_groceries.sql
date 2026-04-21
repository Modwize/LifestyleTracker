-- 0015_milestones_groceries.sql
-- Milestones: award-once semantics + auto-emit events.
-- Grocery suggestions: deduplication so weekly-review can re-run idempotently.

-- Milestones must be awarded at most once per (user, kind). The original
-- unique key included achieved_on, which allowed duplicates across days.
alter table public.milestones drop constraint if exists milestones_user_id_kind_achieved_on_key;
alter table public.milestones add constraint milestones_user_id_kind_key unique (user_id, kind);

-- Every new milestone emits a milestone.awarded event automatically.
create or replace function public.tg_milestone_emit_event()
returns trigger language plpgsql as $$
begin
  insert into public.events (user_id, event_type, payload)
  values (
    new.user_id, 'milestone.awarded',
    jsonb_build_object('id', new.id, 'kind', new.kind, 'achieved_on', new.achieved_on)
  );
  return new;
end$$;

drop trigger if exists milestones_emit_event on public.milestones;
create trigger milestones_emit_event
  after insert on public.milestones
  for each row execute function public.tg_milestone_emit_event();

-- Idempotent milestone-awarding routine. Run from daily-rollup + anywhere
-- we record a waist measurement or confirm a lab draw.
--
-- Non-reward-inflation — one pass only hands out each kind once ever.
create or replace function public.award_pending_milestones(p_user uuid)
returns void
language plpgsql security invoker
as $$
declare
  v_streak integer := 0;
  v_comeback integer := 0;
  v_latest_waist numeric;
  v_has_weekly_80 boolean;
  v_has_lab boolean;
begin
  select coalesce(current_adherence_streak, 0),
         coalesce(current_comeback_streak, 0)
    into v_streak, v_comeback
  from public.streaks where user_id = p_user;

  select average_inches into v_latest_waist
  from public.waist_measurements
  where user_id = p_user
  order by measured_on desc limit 1;

  select exists(
    select 1 from public.weekly_reviews
    where user_id = p_user and adherence_pct >= 80
  ) into v_has_weekly_80;

  select exists(
    select 1 from public.lab_draws
    where user_id = p_user and state = 'confirmed'
  ) into v_has_lab;

  -- Streak tiers
  if v_streak >= 7 then
    insert into public.milestones (user_id, kind, achieved_on, payload)
    values (p_user, 'streak_7', current_date, jsonb_build_object('streak_days', v_streak))
    on conflict (user_id, kind) do nothing;
  end if;
  if v_streak >= 30 then
    insert into public.milestones (user_id, kind, achieved_on, payload)
    values (p_user, 'streak_30', current_date, jsonb_build_object('streak_days', v_streak))
    on conflict (user_id, kind) do nothing;
  end if;
  if v_streak >= 100 then
    insert into public.milestones (user_id, kind, achieved_on, payload)
    values (p_user, 'streak_100', current_date, jsonb_build_object('streak_days', v_streak))
    on conflict (user_id, kind) do nothing;
  end if;

  -- Comeback recognition
  if v_comeback >= 7 then
    insert into public.milestones (user_id, kind, achieved_on)
    values (p_user, 'comeback_7', current_date)
    on conflict (user_id, kind) do nothing;
  end if;

  -- First ≥80% week
  if v_has_weekly_80 then
    insert into public.milestones (user_id, kind, achieved_on)
    values (p_user, 'weekly_80', current_date)
    on conflict (user_id, kind) do nothing;
  end if;

  -- Waist phase hits (ladder: 39 / 37 / 35.5 / 35)
  if v_latest_waist is not null then
    if v_latest_waist <= 39 then
      insert into public.milestones (user_id, kind, achieved_on, payload)
      values (p_user, 'waist_phase_1', current_date, jsonb_build_object('waist_inches', v_latest_waist))
      on conflict (user_id, kind) do nothing;
    end if;
    if v_latest_waist <= 37 then
      insert into public.milestones (user_id, kind, achieved_on, payload)
      values (p_user, 'waist_phase_2', current_date, jsonb_build_object('waist_inches', v_latest_waist))
      on conflict (user_id, kind) do nothing;
    end if;
    if v_latest_waist <= 35.5 then
      insert into public.milestones (user_id, kind, achieved_on, payload)
      values (p_user, 'waist_phase_3', current_date, jsonb_build_object('waist_inches', v_latest_waist))
      on conflict (user_id, kind) do nothing;
    end if;
    if v_latest_waist <= 35 then
      insert into public.milestones (user_id, kind, achieved_on, payload)
      values (p_user, 'waist_optimal', current_date, jsonb_build_object('waist_inches', v_latest_waist))
      on conflict (user_id, kind) do nothing;
    end if;
  end if;

  -- First confirmed lab draw
  if v_has_lab then
    insert into public.milestones (user_id, kind, achieved_on)
    values (p_user, 'first_lab', current_date)
    on conflict (user_id, kind) do nothing;
  end if;
end$$;

-- Grocery suggestions: dedup on (user, week, category, item) so weekly-review
-- can re-run without accumulating duplicates.
alter table public.grocery_suggestions
  add constraint grocery_suggestions_week_item_key unique (user_id, week_start_date, category, item);
