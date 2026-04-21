'use server';

// Barcode-scan server actions: save a food_log row + optionally set today's
// nutrition compliance.

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

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

const COMPLIANCE = ['fully_compliant','mostly_compliant','off_plan_recovered','off_plan'] as const;

export async function saveScannedFood(fd: FormData): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const classification = String(fd.get('classification') ?? '');
  if (!COMPLIANCE.includes(classification as (typeof COMPLIANCE)[number])) return;

  const day = todayISO();
  const barcode = String(fd.get('barcode') ?? '') || null;
  const product = String(fd.get('product_name') ?? '') || null;

  await supabase.from('food_log').insert({
    user_id: user.id, day,
    barcode,
    product_name: product,
    brand: String(fd.get('brand') ?? '') || null,
    serving_size: String(fd.get('serving_size') ?? '') || null,
    calories: num(fd, 'calories'),
    protein_grams: num(fd, 'protein_grams'),
    carb_grams: num(fd, 'carb_grams'),
    fat_grams: num(fd, 'fat_grams'),
    sugar_grams: num(fd, 'sugar_grams'),
    classification,
    source: barcode ? 'open_food_facts' : 'manual',
  });

  // Only update today's overall compliance if the row doesn't already set
  // one — avoids a stricter scan overwriting an earlier off_plan call.
  const { data: existing } = await supabase.from('daily_logs')
    .select('nutrition_compliance').eq('user_id', user.id).eq('day', day).maybeSingle();
  if (!existing?.nutrition_compliance) {
    await supabase.from('daily_logs').upsert({
      user_id: user.id, day, nutrition_compliance: classification,
      sleep_threshold_minutes: 450,
    }, { onConflict: 'user_id,day' });
    await supabase.from('nutrition_days').upsert({
      user_id: user.id, day, compliance: classification, source: 'manual',
    }, { onConflict: 'user_id,day' });
  }

  revalidatePath('/log');
  revalidatePath('/');
  redirect('/log/scan?saved=1');
}
