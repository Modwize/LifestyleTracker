'use server';

// Quick-add server actions. Each form on /log dispatches here.
// All writes are scoped to auth.uid() via RLS — no explicit user filter needed
// beyond sanity checks.

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

const ALLOWED_COMPLIANCE = [
  'fully_compliant', 'mostly_compliant', 'off_plan_recovered', 'off_plan',
] as const;

type Client = ReturnType<typeof createClient>;

async function withUser<T>(fn: (supabase: Client, userId: string) => Promise<T>) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return fn(supabase, user.id);
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function num(fd: FormData, k: string): number | null {
  const raw = fd.get(k);
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function str(fd: FormData, k: string): string | null {
  const raw = fd.get(k);
  return raw == null ? null : String(raw).trim() || null;
}

function done() {
  revalidatePath('/log');
  revalidatePath('/');
  revalidatePath('/week');
  revalidatePath('/timeline');
}

// ─────────────────────────────────────────────────────────────────────────────
// Protein anchor
export async function logProtein(fd: FormData) {
  const grams = num(fd, 'grams');
  const mins = num(fd, 'minutes_after_wake');
  if (grams == null || grams <= 0) return;
  await withUser(async (db, userId) => {
    await db.from('daily_logs').upsert({
      user_id: userId, day: todayISO(),
      protein_breakfast_completed: true,
      protein_breakfast_grams: grams,
      protein_breakfast_minutes_after_wake: mins,
      sleep_threshold_minutes: 450,
    }, { onConflict: 'user_id,day' });
  });
  done();
}

// Steps manual override
export async function logSteps(fd: FormData) {
  const total = num(fd, 'steps_total');
  if (total == null || total < 0) return;
  await withUser(async (db, userId) => {
    const day = todayISO();
    await db.from('daily_logs').upsert({
      user_id: userId, day, steps_total: Math.round(total), sleep_threshold_minutes: 450,
    }, { onConflict: 'user_id,day' });
    await db.from('step_counts').upsert({
      user_id: userId, day, steps: Math.round(total), source: 'manual',
    }, { onConflict: 'user_id,day,source' });
  });
  done();
}

// Sleep manual override
export async function logSleep(fd: FormData) {
  const minutes = num(fd, 'sleep_minutes');
  if (minutes == null || minutes < 0) return;
  await withUser(async (db, userId) => {
    await db.from('daily_logs').upsert({
      user_id: userId, day: todayISO(),
      sleep_minutes: Math.round(minutes), sleep_threshold_minutes: 450,
    }, { onConflict: 'user_id,day' });
  });
  done();
}

// Nutrition compliance
export async function logNutrition(fd: FormData) {
  const compliance = str(fd, 'compliance');
  if (!compliance || !ALLOWED_COMPLIANCE.includes(compliance as (typeof ALLOWED_COMPLIANCE)[number])) return;
  await withUser(async (db, userId) => {
    const day = todayISO();
    await db.from('daily_logs').upsert({
      user_id: userId, day, nutrition_compliance: compliance, sleep_threshold_minutes: 450,
    }, { onConflict: 'user_id,day' });
    await db.from('nutrition_days').upsert({
      user_id: userId, day, compliance, source: 'manual',
    }, { onConflict: 'user_id,day' });
  });
  done();
}

// Waist (Friday protocol: two readings)
export async function logWaist(fd: FormData) {
  const r1 = num(fd, 'reading_1');
  const r2 = num(fd, 'reading_2');
  if (r1 == null || r2 == null) return;
  await withUser(async (db, userId) => {
    await db.from('waist_measurements').upsert({
      user_id: userId, measured_on: todayISO(),
      reading_1_inches: r1, reading_2_inches: r2,
      protocol_notes: 'navel, relaxed, post-exhale',
    }, { onConflict: 'user_id,measured_on' });
  });
  done();
}

// Weight
export async function logWeight(fd: FormData) {
  const lbs = num(fd, 'weight_lbs');
  if (lbs == null || lbs <= 0) return;
  await withUser(async (db, userId) => {
    await db.from('weight_measurements').upsert({
      user_id: userId, measured_on: todayISO(),
      weight_lbs: lbs, source: 'manual',
    }, { onConflict: 'user_id,measured_on,source' });
  });
  done();
}

// Alcohol
export async function logDrinks(fd: FormData) {
  const drinks = num(fd, 'drinks');
  const note = str(fd, 'note');
  if (drinks == null || drinks <= 0) return;
  await withUser(async (db, userId) => {
    await db.from('alcohol_entries').insert({
      user_id: userId, day: todayISO(), drinks, context: note,
    });
  });
  done();
}

// Workout
export async function logWorkout(fd: FormData) {
  const outcome = str(fd, 'outcome');
  if (!outcome || !['done', 'skip', 'rehab'].includes(outcome)) return;
  const completed = outcome === 'done' || outcome === 'rehab';
  await withUser(async (db, userId) => {
    const day = todayISO();
    await db.from('daily_logs').upsert({
      user_id: userId, day,
      workout_scheduled: true, workout_completed: completed,
      sleep_threshold_minutes: 450,
    }, { onConflict: 'user_id,day' });
    await db.from('workouts').insert({
      user_id: userId, day,
      scheduled: true, completed, rehab: outcome === 'rehab',
    });
  });
  done();
}

// Cheat day flag
export async function logCheat(fd: FormData) {
  const on = str(fd, 'on') === 'on';
  await withUser(async (db, userId) => {
    await db.from('daily_logs').upsert({
      user_id: userId, day: todayISO(),
      cheat_day: on, sleep_threshold_minutes: 450,
    }, { onConflict: 'user_id,day' });
  });
  done();
}
