// Shared types for the coaching engine. Mirrors the Postgres schema in /supabase/migrations.
// Pure data types — no IO, no framework assumptions.

export type ISODate = string; // 'YYYY-MM-DD'

export type PhaseMode =
  | 'normal'
  | 'pre_surgery'
  | 'post_surgery'
  | 'rehab'
  | 'newborn_disruption'
  | 'return_to_build';

export type NutritionCompliance =
  | 'fully_compliant'
  | 'mostly_compliant'
  | 'off_plan_recovered'
  | 'off_plan';

export type WeeklyStatus =
  | 'on_track'
  | 'plateau_watch'
  | 'plateau_confirmed'
  | 'regression'
  | 'recovery_advised'
  | 'simplify';

export type AdjustmentAction =
  | 'continue'
  | 'simplify_plan'
  | 'suggest_adjustment'
  | 'behavioral_correction'
  | 'nutrition_adjustment'
  | 'movement_adjustment'
  | 'protocol_redesign'
  | 'recovery_mode'
  | 'reset_protocol';

export interface ScoreWeights {
  nutrition: number;
  protein: number;
  steps: number;
  sleep: number;
  workout: number;
}

export interface DailyLogInput {
  day: ISODate;
  proteinBreakfastCompleted: boolean | null;
  proteinBreakfastGrams: number | null;
  proteinBreakfastMinutesAfterWake: number | null;
  stepsTotal: number | null;
  stepsTarget: number | null;
  sleepMinutes: number | null;
  sleepThresholdMinutes: number;
  nutritionCompliance: NutritionCompliance | null;
  workoutScheduled: boolean;
  workoutCompleted: boolean | null;
  cheatDay: boolean;
}

export interface DailyAdherenceResult {
  day: ISODate;
  score: number; // 0..100
  components: {
    nutrition: number | null;
    protein: number | null;
    steps: number | null;
    sleep: number | null;
    workout: number | null;
  };
  weights: ScoreWeights;
  phaseMode: PhaseMode;
}

export interface WeeklyReviewInput {
  weekStartDate: ISODate;
  dailyScores: Array<{ day: ISODate; score: number }>;
  waist: { previous: number | null; current: number | null };
  weight: { previous: number | null; current: number | null };
  sleepMinutesByDay: Array<{ day: ISODate; minutes: number | null }>;
  stepsByDay: Array<{ day: ISODate; steps: number; target: number }>;
  nutritionByDay: Array<{ day: ISODate; compliance: NutritionCompliance | null }>;
  alcoholDrinksTotal: number;
  readinessByDay: Array<{ day: ISODate; readiness: number | null }>;
  plateauWeeks: number; // consecutive plateau weeks leading into this review
}

export interface WeeklyReviewResult {
  weekStartDate: ISODate;
  adherencePct: number;
  waistChangeInches: number | null;
  weightChangeLbs: number | null;
  sleepMinutesAvg: number;
  stepConsistencyPct: number;
  nutritionComplianceRatio: number;
  status: WeeklyStatus;
  alcoholDrinksTotal: number;
  summaryMd: string;
}

export interface AdjustmentRecommendation {
  action: AdjustmentAction;
  triggerSignal: Record<string, unknown>;
  supportingData: Record<string, unknown>;
  reason: string;
  expectedOutcome: string;
}
