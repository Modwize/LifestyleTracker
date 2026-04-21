// Shared log-op implementations. Server actions (in app/(app)/log/actions.ts)
// and the /api/log replay endpoint both call into here so online vs. offline
// paths always touch the database identically.
//
// Each op takes the authenticated SupabaseClient + user_id + a plain payload
// object. Validation is op-specific. No redirects, no revalidation — callers
// handle that.

import type { SupabaseClient } from '@supabase/supabase-js';

export const LOG_OPS = [
  'protein', 'steps', 'sleep', 'nutrition',
  'waist', 'weight', 'drinks', 'workout', 'cheat',
] as const;
export type LogOp = typeof LOG_OPS[number];

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

const COMPLIANCE = ['fully_compliant','mostly_compliant','off_plan_recovered','off_plan'] as const;

export async function performLogOp(
  db: SupabaseClient, userId: string, op: string, payload: Record<string, unknown>,
  day: string = todayISO(),
): Promise<void> {
  switch (op as LogOp) {
    case 'protein': {
      const grams = num(payload.grams);
      if (grams == null || grams <= 0) throw new Error('grams required');
      const mins = num(payload.minutes_after_wake);
      await db.from('daily_logs').upsert({
        user_id: userId, day,
        protein_breakfast_completed: true,
        protein_breakfast_grams: grams,
        protein_breakfast_minutes_after_wake: mins,
        sleep_threshold_minutes: 450,
      }, { onConflict: 'user_id,day' });
      return;
    }
    case 'steps': {
      const total = num(payload.steps_total);
      if (total == null || total < 0) throw new Error('steps_total required');
      await db.from('daily_logs').upsert({
        user_id: userId, day, steps_total: Math.round(total), sleep_threshold_minutes: 450,
      }, { onConflict: 'user_id,day' });
      await db.from('step_counts').upsert({
        user_id: userId, day, steps: Math.round(total), source: 'manual',
      }, { onConflict: 'user_id,day,source' });
      return;
    }
    case 'sleep': {
      const minutes = num(payload.sleep_minutes);
      if (minutes == null || minutes < 0) throw new Error('sleep_minutes required');
      await db.from('daily_logs').upsert({
        user_id: userId, day, sleep_minutes: Math.round(minutes), sleep_threshold_minutes: 450,
      }, { onConflict: 'user_id,day' });
      return;
    }
    case 'nutrition': {
      const compliance = str(payload.compliance);
      if (!compliance || !COMPLIANCE.includes(compliance as (typeof COMPLIANCE)[number])) {
        throw new Error('invalid compliance');
      }
      await db.from('daily_logs').upsert({
        user_id: userId, day, nutrition_compliance: compliance, sleep_threshold_minutes: 450,
      }, { onConflict: 'user_id,day' });
      await db.from('nutrition_days').upsert({
        user_id: userId, day, compliance, source: 'manual',
      }, { onConflict: 'user_id,day' });
      return;
    }
    case 'waist': {
      const r1 = num(payload.reading_1);
      const r2 = num(payload.reading_2);
      if (r1 == null || r2 == null) throw new Error('two readings required');
      await db.from('waist_measurements').upsert({
        user_id: userId, measured_on: day,
        reading_1_inches: r1, reading_2_inches: r2,
        protocol_notes: 'navel, relaxed, post-exhale',
      }, { onConflict: 'user_id,measured_on' });
      return;
    }
    case 'weight': {
      const lbs = num(payload.weight_lbs);
      if (lbs == null || lbs <= 0) throw new Error('weight_lbs required');
      await db.from('weight_measurements').upsert({
        user_id: userId, measured_on: day, weight_lbs: lbs, source: 'manual',
      }, { onConflict: 'user_id,measured_on,source' });
      return;
    }
    case 'drinks': {
      const drinks = num(payload.drinks);
      if (drinks == null || drinks <= 0) throw new Error('drinks required');
      await db.from('alcohol_entries').insert({
        user_id: userId, day, drinks, context: str(payload.note),
      });
      return;
    }
    case 'workout': {
      const outcome = str(payload.outcome);
      if (!outcome || !['done', 'skip', 'rehab'].includes(outcome)) throw new Error('invalid outcome');
      const completed = outcome === 'done' || outcome === 'rehab';
      await db.from('daily_logs').upsert({
        user_id: userId, day,
        workout_scheduled: true, workout_completed: completed,
        sleep_threshold_minutes: 450,
      }, { onConflict: 'user_id,day' });
      await db.from('workouts').insert({
        user_id: userId, day, scheduled: true, completed, rehab: outcome === 'rehab',
      });
      return;
    }
    case 'cheat': {
      const on = str(payload.on) === 'on';
      await db.from('daily_logs').upsert({
        user_id: userId, day, cheat_day: on, sleep_threshold_minutes: 450,
      }, { onConflict: 'user_id,day' });
      return;
    }
    default:
      throw new Error(`unknown log op: ${op}`);
  }
}
