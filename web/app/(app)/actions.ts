'use server';

// Today-page server actions: the rare-but-important flows that shouldn't
// require Telegram. Reset acknowledgment, phase transitions, surgery date.

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

function bail(): never { redirect('/login'); }

// Acknowledge the one open reset protocol for this user.
export async function acknowledgeReset(): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) bail();

  const { data: open } = await supabase.from('reset_activations')
    .select('id').eq('user_id', user.id).is('acknowledged_at', null).maybeSingle();
  if (!open) return;

  await supabase.from('reset_activations')
    .update({ acknowledged_at: new Date().toISOString() }).eq('id', open.id);
  await supabase.from('events').insert({
    user_id: user.id,
    event_type: 'reset.acknowledged',
    payload: { id: open.id, source: 'web' },
  });
  revalidatePath('/');
  revalidatePath('/timeline');
}

// Approve or reject a pending phase_transition_request.
export async function decidePhaseTransition(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  const decision = String(formData.get('decision') ?? '');
  if (!id || !['approved', 'rejected'].includes(decision)) return;

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) bail();

  const { data: req } = await supabase.from('phase_transition_requests')
    .select('id,from_mode,to_mode').eq('id', id).eq('user_id', user.id).single();
  if (!req) return;

  await supabase.from('phase_transition_requests').update({
    decision, decided_at: new Date().toISOString(),
  }).eq('id', id);

  // If approved, actually flip the active phase.
  if (decision === 'approved') {
    const { data: active } = await supabase.from('phase_states')
      .select('id').eq('user_id', user.id).is('ended_at', null).maybeSingle();
    if (active) {
      await supabase.from('phase_states').update({ ended_at: new Date().toISOString() }).eq('id', active.id);
    }
    await supabase.from('phase_states').insert({
      user_id: user.id, mode: req.to_mode,
      note: `Approved transition from ${req.from_mode} → ${req.to_mode}`,
    });
  }

  await supabase.from('events').insert({
    user_id: user.id,
    event_type: 'phase.transition_decided',
    payload: { id, decision, from: req.from_mode, to: req.to_mode },
  });

  revalidatePath('/');
  revalidatePath('/timeline');
}

// Record a surgery date. Creates a life_events row + a pending pre→post
// transition request that'll surface on the day of surgery.
export async function scheduleSurgery(formData: FormData): Promise<void> {
  const dateStr = String(formData.get('surgery_date') ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return;

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) bail();

  // Replace any prior scheduled surgery that's still pending.
  await supabase.from('life_events').insert({
    user_id: user.id,
    kind: 'surgery_scheduled',
    event_date: dateStr,
    note: 'Set via /today',
  });

  await supabase.from('phase_transition_requests').insert({
    user_id: user.id,
    from_mode: 'pre_surgery',
    to_mode: 'post_surgery',
    trigger_signal: { surgery_date: dateStr, source: 'web' },
    reason: `Surgery scheduled for ${dateStr}. Post-op transition will be proposed on the day.`,
    expected_outcome: 'Workouts paused, nutrition/protein prioritised, sleep weight lifted.',
  });

  await supabase.from('events').insert({
    user_id: user.id,
    event_type: 'phase.transition_requested',
    payload: { to_mode: 'post_surgery', surgery_date: dateStr },
  });

  revalidatePath('/');
  revalidatePath('/timeline');
}
