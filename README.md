# Modwize LifestyleTracker — Adherence-First Coaching (v1)

This is the data model + event logic layer for the adherence-first
transformation coaching system described in the Product Spec. It's built against
Modwize's Supabase/Postgres infrastructure with an engine-layer written as
pure TypeScript so the same logic runs in edge functions, cron jobs, and tests.

## Architecture at a glance

```
┌───────────────┐   ingest      ┌─────────────────────────────┐
│ Apple Health  │──────────────▶│  step_counts                │
│ Oura          │──────────────▶│  sleep_records / readiness  │
│ MyFitnessPal  │──────────────▶│  nutrition_days             │
│ Manual (waist)│──────────────▶│  waist_measurements         │
│ Documents     │──────────────▶│  documents                  │
└───────────────┘               └──────────────┬──────────────┘
                                               │
                                               ▼
                                ┌─────────────────────────────┐
                                │  daily_logs (expected vs.    │
                                │  completed per day)          │
                                └──────────────┬──────────────┘
                                               ▼
                          ┌──────────────────────────────────────┐
                          │  src/engine  — pure TS               │
                          │  ├── adherence.ts   (daily score)    │
                          │  ├── weights.ts     (phase adaptive) │
                          │  ├── weeklyReview.ts                 │
                          │  ├── adjustments.ts (transparent)    │
                          │  ├── plateau.ts     (ladder)         │
                          │  ├── phase.ts       (transitions)    │
                          │  ├── stepProgression.ts              │
                          │  ├── reset.ts                        │
                          │  ├── alcohol.ts                      │
                          │  ├── notifications.ts (≤10/day cap)  │
                          │  └── measurement.ts                  │
                          └──────────────┬───────────────────────┘
                                         ▼
┌──────────────────────────┐   writes   ┌─────────────────────────────┐
│ supabase/functions       │───────────▶│  daily_adherence_scores     │
│  ├── daily-rollup/       │            │  weekly_reviews             │
│  └── weekly-review/      │            │  adjustments (w/ provenance)│
└──────────────────────────┘            │  events (append-only)       │
                                        │  signal_snapshots           │
                                        └─────────────────────────────┘
```

## Data model

Every user-scoped table has RLS locked to `auth.uid()` (see `0008_views_and_rls.sql`).
All compute outputs (scores, reviews) are keyed by `(user_id, day)` or
`(user_id, week_start_date)` so both edge functions are idempotent — safe to
re-run after a late Oura sync.

Migration files map 1:1 to domains:

| File | Contents |
| --- | --- |
| `0001_core_identity.sql` | `users`, `user_baselines`, `user_settings`, `waist_target_ladder` |
| `0002_phase_state.sql` | `phase_states`, `phase_transition_requests`, `step_progression_plans` |
| `0003_measurements.sql` | `waist_measurements` (dual-reading w/ average), `weight_measurements`, `bloodwork_results` |
| `0004_integrations.sql` | `step_counts`, `sleep_records`, `oura_readiness`, `nutrition_days`, `workouts`, `alcohol_entries`, `documents` |
| `0005_daily_adherence.sql` | `daily_logs`, `daily_adherence_scores`, `protein_sources`, `streaks`, `milestones` |
| `0006_weekly_review.sql` | `weekly_reviews`, `plateau_states`, `reset_activations`, `adjustments`, `grocery_suggestions`, `notifications` |
| `0007_events.sql` | `events` (append-only bus), `signal_snapshots` |
| `0008_views_and_rls.sql` | `today_actions`, `current_week_adherence`, `home_alerts`, RLS for all tables |

## Engine (event logic layer)

Pure TypeScript modules in `src/engine/`. Each one is deterministic and
side-effect-free so it can be exercised in unit tests and re-used from edge
functions, the Next.js app, or a CLI.

| Module | Responsibility |
| --- | --- |
| `adherence.ts` | Daily score (0–100), redistributes weight off missing signals (no punishment). |
| `weights.ts` | Baseline weights (30/20/20/20/10) + phase-mode multipliers; renormalises. |
| `weeklyReview.ts` | Friday roll-up → `WeeklyReviewResult` with deterministic `status`. |
| `adjustments.ts` | Selects one `AdjustmentAction` per review, always with trigger/reason/expected-outcome. |
| `plateau.ts` | Plateau window detector + 4-rung escalation ladder. |
| `phase.ts` | Proposes phase transitions (requires manual approval). |
| `stepProgression.ts` | 4k→10k Phase-1 ladder with recovery-mode compression. |
| `reset.ts` | 2–3 low-adherence-day trigger + Reset Protocol definition. |
| `alcohol.ts` | ≤4 neutral / 5–6 warning / >6 escalation gated by impact. |
| `notifications.ts` | Daily plan with ≤10/day cap, priority-aware dropping. |
| `measurement.ts` | Waist averaging, ratio, phase-from-waist helpers. |
| `events.ts` | Event envelope + in-memory sink for tests. |

## Spec → implementation map

| Spec section | Data | Engine |
| --- | --- | --- |
| User Baseline Profile | `users`, `user_baselines` | `measurement.resolveWaist` |
| Measurement Protocol | `waist_measurements` (stores both readings + generated average) | `measurement.averageWaist` |
| Data Sources (single source of truth) | `data_source` enum + one table per source | ingest edge functions |
| Daily Adherence Engine | `daily_logs`, `daily_adherence_scores` | `adherence.computeDailyAdherence` |
| Adherence Score Model (adaptive weights) | `nutrition_weight`, `protein_weight`, ... columns | `weights.resolveWeights` |
| Step Progression Plan | `step_progression_plans` | `stepProgression.resolveStepTarget` |
| 30-30-30 Morning Anchor | `protein_sources` reference table + `protein_breakfast_*` columns | `adherence.scoreProteinAnchor` |
| Weekly Review Engine | `weekly_reviews` | `weeklyReview.runWeeklyReview` |
| Adjustment Logic | `adjustments` (w/ decision enum) | `adjustments.selectAdjustment` |
| Plateau Detection | `plateau_states` | `plateau.isPlateau` + `plateauAction` |
| Recovery-Aware Timeline | `phase_states`, `phase_transition_requests` | `phase.proposePhaseTransition`, `weights.PHASE_MULTIPLIERS` |
| Notification Strategy | `notifications` (scheduled + delivered) | `notifications.planDailyNotifications` |
| Reset Protocol | `reset_activations` | `reset.evaluateResetTrigger`, `RESET_PROTOCOL` |
| Cheat Day Model | `daily_logs.cheat_day`, `user_settings.cheat_day_mode` | `adherence` handles cheat-day nutrition fallback |
| Alcohol Tracking Logic | `alcohol_entries` | `alcohol.classifyAlcoholWeek` |
| Grocery Suggestion Engine | `grocery_suggestions` | (generated off weekly review + gaps) |
| Dashboard Layout | `today_actions`, `current_week_adherence`, `home_alerts` views | — |
| Bloodwork Integration | `bloodwork_results` | — (baseline-only, not in weekly decisions) |
| Phase-1 Waist Target Ladder | `waist_target_ladder` seed per user | `measurement.phaseForWaist` |
| Adjustment Transparency | `adjustments` columns: `trigger_signal`, `supporting_data`, `reason`, `expected_outcome` | `adjustments.selectAdjustment` always fills all four |
| Life-Event Awareness | `phase_transition_requests.decision` (pending/approved/rejected) | `phase.proposePhaseTransition` (never auto-applies) |

## Edge functions

- `supabase/functions/daily-rollup/` — Load a day's inputs, compute adherence,
  upsert score, update streak/comeback, evaluate reset trigger, emit events.
- `supabase/functions/weekly-review/` — Friday-only. Roll week up, classify
  status, compute adjustment with full provenance, emit events, write
  `weekly_reviews` + `adjustments`.

Both are idempotent on their natural keys; re-running after a late sync is
safe.

## Event bus

`events` is append-only. Every score, review, adjustment, phase request,
notification, streak change, and reset step lands there with a `caused_by_event_id`
link back to the prior event. That's what powers the spec's **Adjustment
Transparency Requirement**: any UI card can render the full causal chain
("why did you suggest this?") by walking `caused_by_event_id`.

## What isn't here (by design)

- No UI code — this PR is schema + engine only. The dashboard described in the
  spec is a separate project that reads the `today_actions`, `current_week_adherence`,
  and `home_alerts` views plus the `adjustments` pending queue.
- No nutrition-tracking UI — spec explicitly says the system is not a
  MyFitnessPal replacement; we ingest compliance state, not macros-per-meal.
- No social / punishment / reward-inflation mechanics — the spec excludes them,
  and `user_settings.social_sharing_enabled` defaults to `false`.
