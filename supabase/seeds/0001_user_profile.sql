-- 0001_user_profile.sql
-- One-time seed for the primary user. Run AFTER signing up via Supabase Auth
-- (magic link to the email below). The seed looks up the auth.users row by
-- email, so run the auth flow first.
--
-- Usage:
--   1) Sign up with the app or `supabase auth magic-link <email>`
--   2) psql "$SUPABASE_DB_URL" -v owner_email="'you@example.com'" -f supabase/seeds/0001_user_profile.sql
--
-- Re-running is idempotent: every insert is ON CONFLICT DO UPDATE / DO NOTHING.

\set ON_ERROR_STOP on

do $$
declare
  v_user uuid;
begin
  select id into v_user from auth.users where email = :owner_email;
  if v_user is null then
    raise exception 'No auth.users row found for %. Sign up first.', :owner_email;
  end if;

  -- Profile (spec §User Baseline Profile)
  insert into public.users (
    id, display_name, height_inches,
    wake_window_start, wake_window_end,
    work_start, work_end,
    measurement_location, check_in_weekday, timezone
  ) values (
    v_user, 'Primary', 71,
    '07:30', '08:30',
    '09:00', '17:30',
    'navel', 5, 'America/New_York'
  )
  on conflict (id) do update set
    height_inches = excluded.height_inches,
    wake_window_start = excluded.wake_window_start,
    wake_window_end = excluded.wake_window_end,
    measurement_location = excluded.measurement_location,
    check_in_weekday = excluded.check_in_weekday,
    timezone = excluded.timezone,
    updated_at = now();

  -- Baseline — preserved for trend math, never mutated after onboarding.
  insert into public.user_baselines (
    user_id, weight_lbs, waist_inches, height_inches_cache,
    daily_steps_baseline, training_experience, injury_status
  ) values (
    v_user, 217, 42, 71,
    3000, 'advanced', 'awaiting_shoulder_surgery'
  )
  on conflict (user_id) do nothing;

  -- Settings (spec: ≤4 soft / ≤6 hard; Saturday cheat day; weekly unrestricted)
  insert into public.user_settings (
    user_id, alcohol_soft_cap_week, alcohol_hard_cap_week,
    max_daily_notifications, cheat_day_weekday, cheat_day_mode,
    gamification_enabled, social_sharing_enabled
  ) values (
    v_user, 4, 6,
    10, 6, 'weekly_unrestricted',  -- 6 = Saturday
    true, false
  )
  on conflict (user_id) do update set
    alcohol_soft_cap_week = excluded.alcohol_soft_cap_week,
    alcohol_hard_cap_week = excluded.alcohol_hard_cap_week,
    cheat_day_weekday = excluded.cheat_day_weekday,
    cheat_day_mode = excluded.cheat_day_mode,
    updated_at = now();

  -- Waist target ladder (spec §Phase-1 Waist Target Ladder).
  insert into public.waist_target_ladder (user_id, phase, target_waist_inches, label) values
    (v_user, 1, 39.0,  'Phase 1'),
    (v_user, 2, 37.0,  'Phase 2'),
    (v_user, 3, 35.5,  'Phase 3'),
    (v_user, 4, 35.0,  'Optimal')
  on conflict (user_id, phase) do update set
    target_waist_inches = excluded.target_waist_inches,
    label = excluded.label;

  -- Opening phase: pre_surgery (user is awaiting shoulder surgery).
  if not exists (select 1 from public.phase_states where user_id = v_user and ended_at is null) then
    insert into public.phase_states (
      user_id, mode, note,
      step_weight_multiplier, workout_weight_multiplier,
      sleep_weight_multiplier, nutrition_weight_multiplier
    ) values (
      v_user, 'pre_surgery', 'Opening phase: awaiting shoulder surgery — no training scheduled.',
      0.90, 0.50, 1.10, 1.05
    );
  end if;

  -- Phase-1 step ladder (4k→10k over 8 weeks).
  -- effective_from = today; rungs advance weekly from there.
  insert into public.step_progression_plans
    (user_id, phase, week_in_phase, step_target, effective_from, effective_to)
  select v_user, 1, wk,
         case when wk in (1,2) then 4000
              when wk in (3,4) then 6000
              when wk in (5,6) then 8000
              else 10000 end,
         (current_date + ((wk - 1) * 7))::date,
         (current_date + (wk * 7) - 1)::date
  from generate_series(1, 8) as wk
  on conflict do nothing;

  -- Streaks row exists so the engine can upsert without a pre-check.
  insert into public.streaks (user_id) values (v_user)
  on conflict (user_id) do nothing;

end$$;

select 'seed complete' as status;
