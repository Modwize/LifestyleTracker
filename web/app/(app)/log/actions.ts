'use server';

// Thin server actions — each parses FormData into the op's payload shape and
// delegates to performLogOp. The shared module is also used by /api/log when
// replaying from the offline queue.

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { performLogOp } from '@/lib/log-ops';

type Client = ReturnType<typeof createClient>;

async function withUser<T>(fn: (db: Client, userId: string) => Promise<T>): Promise<T> {
  const db = createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/login');
  return fn(db, user.id);
}

function fdObj(fd: FormData): Record<string, unknown> {
  return Object.fromEntries(fd.entries());
}

function done() {
  revalidatePath('/log');
  revalidatePath('/');
  revalidatePath('/week');
  revalidatePath('/timeline');
}

export async function logProtein(fd: FormData)    { await withUser((db, u) => performLogOp(db, u, 'protein',   fdObj(fd))); done(); }
export async function logSteps(fd: FormData)      { await withUser((db, u) => performLogOp(db, u, 'steps',     fdObj(fd))); done(); }
export async function logSleep(fd: FormData)      { await withUser((db, u) => performLogOp(db, u, 'sleep',     fdObj(fd))); done(); }
export async function logNutrition(fd: FormData)  { await withUser((db, u) => performLogOp(db, u, 'nutrition', fdObj(fd))); done(); }
export async function logWaist(fd: FormData)      { await withUser((db, u) => performLogOp(db, u, 'waist',     fdObj(fd))); done(); }
export async function logWeight(fd: FormData)     { await withUser((db, u) => performLogOp(db, u, 'weight',    fdObj(fd))); done(); }
export async function logDrinks(fd: FormData)     { await withUser((db, u) => performLogOp(db, u, 'drinks',    fdObj(fd))); done(); }
export async function logWorkout(fd: FormData)    { await withUser((db, u) => performLogOp(db, u, 'workout',   fdObj(fd))); done(); }
export async function logCheat(fd: FormData)      { await withUser((db, u) => performLogOp(db, u, 'cheat',     fdObj(fd))); done(); }
