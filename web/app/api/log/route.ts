// Replay endpoint for the offline queue. Accepts JSON and delegates to the
// same performLogOp the server actions use.
//
// Body: { op: string, payload: Record<string, unknown>, day?: string }
//
// The optional `day` lets a replayed action target the day it was originally
// queued on, not the day it finally replays — important when you log an
// evening event and the flusher doesn't fire until the next morning.

import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { performLogOp, todayISO } from '@/lib/log-ops';

export async function POST(req: Request) {
  let body: { op?: string; payload?: Record<string, unknown>; day?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad_json' }, { status: 400 }); }

  const op = body.op;
  if (!op) return NextResponse.json({ error: 'op_required' }, { status: 400 });

  const db = createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    await performLogOp(db, user.id, op, body.payload ?? {}, body.day ?? todayISO());
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'op_failed';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  revalidatePath('/log');
  revalidatePath('/');
  revalidatePath('/week');
  revalidatePath('/timeline');
  return NextResponse.json({ ok: true });
}
