-- 0008_views_and_rls.sql
-- Dashboard-backing views + Row-Level Security.

-- "What do I do today?" — home-screen top block.
create or replace view public.today_actions as
  select
    u.id as user_id,
    current_date as day,
    coalesce(dl.protein_breakfast_completed, false) as protein_breakfast_completed,
    dl.steps_total,
    dl.steps_target,
    coalesce(dl.steps_target_met, false) as steps_target_met,
    coalesce(dl.sleep_threshold_met, false) as sleep_threshold_met,
    dl.nutrition_compliance,
    dl.workout_scheduled,
    coalesce(dl.workout_completed, false) as workout_completed
  from public.users u
  left join public.daily_logs dl
    on dl.user_id = u.id and dl.day = current_date;

-- "Am I on track this week?" — adherence % over current Friday-anchored week.
create or replace view public.current_week_adherence as
  select
    user_id,
    date_trunc('week', current_date + interval '3 day')::date - interval '3 day' as week_start,
    round(avg(score)::numeric, 1) as adherence_pct,
    count(*) filter (where score >= 80) as strong_days,
    count(*) as tracked_days
  from public.daily_adherence_scores
  where day >= (current_date - interval '6 day')
  group by user_id, week_start;

-- Home-screen alert feed: unresolved plateaus, open resets, pending adjustments.
create or replace view public.home_alerts as
  select user_id, 'plateau'::text as kind, id as ref_id, detected_on as since
    from public.plateau_states where resolved_on is null
  union all
  select user_id, 'reset_pending', id, triggered_on
    from public.reset_activations where acknowledged_at is null
  union all
  select user_id, 'adjustment_pending', id, created_at::date
    from public.adjustments where decision = 'pending';

-- RLS: every user-scoped table locked to auth.uid().
do $$
declare t text;
begin
  for t in
    select unnest(array[
      'users','user_baselines','user_settings','waist_target_ladder',
      'phase_states','phase_transition_requests','step_progression_plans',
      'waist_measurements','weight_measurements','bloodwork_results',
      'step_counts','sleep_records','oura_readiness','nutrition_days',
      'workouts','alcohol_entries','documents',
      'daily_logs','daily_adherence_scores','streaks','milestones',
      'weekly_reviews','plateau_states','reset_activations',
      'adjustments','grocery_suggestions','notifications',
      'events','signal_snapshots'
    ])
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format($p$
      create policy %I_owner on public.%I
        using (user_id = auth.uid())
        with check (user_id = auth.uid());
    $p$, t, t);
  end loop;
end$$;

-- protein_sources is a shared reference table — readable by all authenticated users.
alter table public.protein_sources enable row level security;
create policy protein_sources_read on public.protein_sources
  for select using (auth.role() = 'authenticated');
