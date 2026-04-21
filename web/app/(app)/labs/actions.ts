'use server';

// Server actions for the /labs surface.
// Uploads, extraction kickoff, review confirmation / discard.

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { randomUUID } from 'node:crypto';

const BUCKET = 'lab-reports';

export async function uploadLabPdf(formData: FormData): Promise<void> {
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) redirect('/labs/upload?error=no_file');
  if (file.type !== 'application/pdf') redirect('/labs/upload?error=not_pdf');
  if (file.size > 10 * 1024 * 1024) redirect('/labs/upload?error=too_large');

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const drawId = randomUUID();
  const path = `${user.id}/${drawId}.pdf`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const { error: uploadErr } = await supabase.storage.from(BUCKET)
    .upload(path, bytes, { contentType: 'application/pdf', upsert: false });
  if (uploadErr) redirect(`/labs/upload?error=${encodeURIComponent(uploadErr.message)}`);

  const { error: insertErr } = await supabase.from('lab_draws').insert({
    id: drawId,
    user_id: user.id,
    storage_bucket: BUCKET,
    storage_path: path,
    state: 'uploaded',
  });
  if (insertErr) redirect(`/labs/upload?error=${encodeURIComponent(insertErr.message)}`);

  // Kick off extraction asynchronously. We don't await completion — the
  // review page shows "extracting..." until the state flips.
  await supabase.functions.invoke('extract-lab-draw', { body: { draw_id: drawId } })
    .catch(() => {/* the edge function logs its own errors; state will be 'failed' if so */});

  revalidatePath('/labs');
  redirect(`/labs/review/${drawId}`);
}

// Persist the reviewed payload as bloodwork_results rows. Idempotent per draw:
// re-confirming deletes prior rows for this draw and re-inserts from the
// supplied form state (the user may have edited values during review).
export async function confirmLabDraw(formData: FormData): Promise<void> {
  const drawId = String(formData.get('draw_id') ?? '');
  const drawnOn = String(formData.get('drawn_on') ?? '') || null;
  const labName = String(formData.get('lab_name') ?? '') || null;
  if (!drawId) redirect('/labs');

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: draw } = await supabase.from('lab_draws')
    .select('id,extraction_payload').eq('id', drawId).eq('user_id', user.id).single();
  if (!draw) redirect('/labs');

  const payload = (draw.extraction_payload ?? {}) as {
    resolved?: Array<{
      raw_marker_text: string;
      canonical_marker_id: number | null;
      value: number | null;
      unit: string | null;
      reference_low: number | null;
      reference_high: number | null;
      flag: 'low' | 'normal' | 'high' | 'critical' | null;
    }>;
  };
  const resolved = payload.resolved ?? [];

  // Apply per-row overrides from the form. We only pick up markers that the
  // user kept (no `keep_<i>` unchecked) and allow editing the canonical
  // mapping + numeric value.
  const rows = resolved.flatMap((r, i) => {
    const kept = formData.get(`keep_${i}`) === 'on';
    if (!kept) return [];
    const overrideSlug = String(formData.get(`slug_${i}`) ?? '');
    const overrideValue = formData.get(`value_${i}`);
    const valueNum = overrideValue != null && overrideValue !== ''
      ? Number(overrideValue) : r.value;
    return [{
      user_id: user.id,
      draw_id: drawId,
      drawn_on: drawnOn,
      marker: overrideSlug || r.raw_marker_text,
      raw_marker_text: r.raw_marker_text,
      canonical_marker_id: null as number | null, // set below after slug→id lookup
      _slug: overrideSlug || null,
      value: Number.isFinite(valueNum) ? valueNum : null,
      unit: r.unit,
      reference_low: r.reference_low,
      reference_high: r.reference_high,
      flag: r.flag,
      lab_name: labName,
    }];
  });

  // Resolve any overridden slugs to canonical_marker_ids in a single query.
  const slugs = Array.from(new Set(rows.map((r) => r._slug).filter(Boolean) as string[]));
  const slugToId = new Map<string, number>();
  if (slugs.length) {
    const { data: cms } = await supabase.from('canonical_markers').select('id,slug').in('slug', slugs);
    for (const c of cms ?? []) slugToId.set(c.slug as string, c.id as number);
  }
  // Fall back to the LLM's pre-resolved id when the user didn't override.
  const resolvedById = new Map<number, { canonical_marker_id: number | null }>();
  resolved.forEach((r, i) => resolvedById.set(i, { canonical_marker_id: r.canonical_marker_id }));

  const toInsert = rows.map((r, i) => ({
    user_id: r.user_id,
    draw_id: r.draw_id,
    drawn_on: r.drawn_on,
    marker: r.marker,
    raw_marker_text: r.raw_marker_text,
    canonical_marker_id: r._slug
      ? slugToId.get(r._slug) ?? null
      : resolvedById.get(i)?.canonical_marker_id ?? null,
    value: r.value,
    unit: r.unit,
    reference_low: r.reference_low,
    reference_high: r.reference_high,
    flag: r.flag,
    lab_name: r.lab_name,
  }));

  // Idempotent: wipe any prior rows for this draw, then insert.
  await supabase.from('bloodwork_results').delete().eq('draw_id', drawId);
  if (toInsert.length) {
    const { error: insertErr } = await supabase.from('bloodwork_results').insert(toInsert);
    if (insertErr) redirect(`/labs/review/${drawId}?error=${encodeURIComponent(insertErr.message)}`);
  }

  await supabase.from('lab_draws').update({
    state: 'confirmed',
    confirmed_at: new Date().toISOString(),
    drawn_on: drawnOn,
    lab_name: labName,
  }).eq('id', drawId);

  await supabase.from('events').insert({
    user_id: user.id,
    event_type: 'document.ingested',
    payload: { draw_id: drawId, step: 'confirmed', marker_count: toInsert.length },
  });

  revalidatePath('/labs');
  revalidatePath(`/labs/${drawId}`);
  redirect(`/labs/${drawId}`);
}

export async function deleteLabDraw(formData: FormData): Promise<void> {
  const drawId = String(formData.get('draw_id') ?? '');
  if (!drawId) redirect('/labs');

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: draw } = await supabase.from('lab_draws')
    .select('id,storage_bucket,storage_path').eq('id', drawId).eq('user_id', user.id).single();
  if (!draw) redirect('/labs');

  // Remove the PDF from storage first so it can't be orphaned.
  await supabase.storage.from(draw.storage_bucket).remove([draw.storage_path]).catch(() => {});
  await supabase.from('lab_draws').delete().eq('id', drawId);

  revalidatePath('/labs');
  redirect('/labs');
}
