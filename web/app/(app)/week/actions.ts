'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export async function decideAdjustment(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  const decision = String(formData.get('decision') ?? '') as 'accepted' | 'rejected';
  if (!id || !['accepted', 'rejected'].includes(decision)) return;

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from('adjustments')
    .update({ decision, decided_at: new Date().toISOString() })
    .eq('id', id).eq('user_id', user.id);

  await supabase.from('events').insert({
    user_id: user.id,
    event_type: 'adjustment.decided',
    payload: { id, decision, source: 'web' },
  });

  revalidatePath('/week');
  revalidatePath('/');
}
