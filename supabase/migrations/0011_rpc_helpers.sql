-- 0011_rpc_helpers.sql
-- Small SECURITY DEFINER helpers so the Telegram webhook can read/act as a
-- specific user without needing the service-role client for every query.
-- The edge function still uses the service-role key, but routing through these
-- keeps auditability aligned with user_id.

-- Return the active phase mode for a user (or 'normal' when none).
create or replace function public.active_phase_mode(p_user uuid)
returns public.phase_mode
language sql stable
as $$
  select coalesce(
    (select mode from public.phase_states
      where user_id = p_user and ended_at is null
      order by started_at desc limit 1),
    'normal'::public.phase_mode
  );
$$;

-- Current Friday-anchored week start for a user (respects their timezone).
create or replace function public.current_week_start(p_user uuid)
returns date
language sql stable
as $$
  with u as (select timezone from public.users where id = p_user)
  select (
    (now() at time zone (select timezone from u))::date
    - ((extract(dow from (now() at time zone (select timezone from u)))::int - 5 + 7) % 7)
  );
$$;

-- Latest pending adjustment for user — used by the Telegram /accept and /reject commands.
create or replace function public.latest_pending_adjustment(p_user uuid)
returns public.adjustments
language sql stable
as $$
  select * from public.adjustments
  where user_id = p_user and decision = 'pending'
  order by created_at desc limit 1;
$$;

-- Handy view for home + bot "week snapshot".
create or replace view public.week_snapshot as
  select
    wr.user_id,
    wr.week_start_date,
    wr.status,
    wr.adherence_pct,
    wr.waist_change_inches,
    wr.weight_change_lbs,
    wr.sleep_minutes_avg,
    wr.step_consistency_pct,
    wr.nutrition_compliance_ratio,
    wr.alcohol_drinks_total
  from public.weekly_reviews wr
  where wr.week_start_date = public.current_week_start(wr.user_id);
