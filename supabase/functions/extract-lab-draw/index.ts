// extract-lab-draw
// Invoked after a PDF is uploaded to the 'lab-reports' bucket. Downloads the
// PDF via signed URL, sends to Claude for structured extraction, stores the
// parsed result on the lab_draws row and flips state to 'review'.
//
// Input:  { draw_id: uuid }
// Output: the updated lab_draws row.
//
// This is the one place bloodwork PDFs leave Supabase. Everything else reads
// the extracted JSON only.

import { serviceClient } from '../_shared/db.ts';
import { extractLabPdf, type ExtractedMarker } from '../_shared/llm.ts';

interface Request { draw_id: string }

Deno.serve(async (req) => {
  const { draw_id } = (await req.json()) as Request;
  if (!draw_id) return new Response('missing draw_id', { status: 400 });

  const db = serviceClient();

  const { data: draw, error: fetchErr } = await db.from('lab_draws')
    .select('id,user_id,storage_bucket,storage_path,state').eq('id', draw_id).single();
  if (fetchErr || !draw) return new Response('draw not found', { status: 404 });
  if (draw.state === 'confirmed') return Response.json({ skipped: 'already_confirmed' });

  await db.from('lab_draws').update({ state: 'extracting' }).eq('id', draw_id);
  await db.from('events').insert({
    user_id: draw.user_id,
    event_type: 'document.ingested',
    payload: { draw_id, step: 'extraction_started' },
  });

  try {
    // Download via a short-lived signed URL. The bucket is private.
    const { data: signed, error: signErr } = await db.storage
      .from(draw.storage_bucket).createSignedUrl(draw.storage_path, 60);
    if (signErr || !signed?.signedUrl) throw new Error(`signed URL failed: ${signErr?.message}`);

    const pdfRes = await fetch(signed.signedUrl);
    if (!pdfRes.ok) throw new Error(`PDF download failed: ${pdfRes.status}`);
    const pdfBytes = new Uint8Array(await pdfRes.arrayBuffer());

    const extraction = await extractLabPdf(pdfBytes);

    // Resolve canonical marker IDs from the LLM's slug guesses + raw text fallback.
    const slugs = Array.from(new Set(
      extraction.markers.map((m) => m.canonical_slug).filter((s): s is string => !!s),
    ));
    const { data: canonicals } = await db.from('canonical_markers')
      .select('id,slug,aliases').in('slug', slugs.length ? slugs : ['__none__']);

    const bySlug = new Map<string, { id: number }>(
      (canonicals ?? []).map((c) => [c.slug as string, { id: c.id }]),
    );

    // Also fetch all markers for a secondary alias match (raw_marker_text → slug).
    const { data: allCanonicals } = await db.from('canonical_markers').select('id,slug,aliases');
    const aliasIndex = buildAliasIndex(allCanonicals ?? []);

    const resolved = extraction.markers.map((m) => resolveMarker(m, bySlug, aliasIndex));

    await db.from('lab_draws').update({
      drawn_on: extraction.drawn_on,
      lab_name: extraction.lab_name,
      extraction_payload: { ...extraction, resolved },
      extraction_model: extraction.model,
      state: 'review',
    }).eq('id', draw_id);

    await db.from('events').insert({
      user_id: draw.user_id,
      event_type: 'document.ingested',
      payload: {
        draw_id, step: 'extraction_complete',
        marker_count: extraction.markers.length,
        mapped_count: resolved.filter((r) => r.canonical_marker_id != null).length,
      },
    });

    return Response.json({ ok: true, draw_id, markers: resolved.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.from('lab_draws').update({
      state: 'failed', extraction_error: msg,
    }).eq('id', draw_id);
    await db.from('events').insert({
      user_id: draw.user_id, event_type: 'document.ingested',
      payload: { draw_id, step: 'extraction_failed', error: msg },
    });
    return new Response(`extraction failed: ${msg}`, { status: 500 });
  }
});

// ─────────────────────────────────────────────────────────────────────────────

interface ResolvedMarker extends ExtractedMarker {
  canonical_marker_id: number | null;
  resolution_source: 'llm_slug' | 'alias_match' | 'unresolved';
}

function buildAliasIndex(rows: Array<{ id: number; slug: string; aliases: string[] }>): Map<string, number> {
  const idx = new Map<string, number>();
  for (const r of rows) {
    idx.set(normalize(r.slug), r.id);
    idx.set(normalize(r.slug.replace(/_/g, ' ')), r.id);
    for (const a of r.aliases ?? []) idx.set(normalize(a), r.id);
  }
  return idx;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function resolveMarker(
  m: ExtractedMarker,
  bySlug: Map<string, { id: number }>,
  aliasIndex: Map<string, number>,
): ResolvedMarker {
  if (m.canonical_slug) {
    const hit = bySlug.get(m.canonical_slug);
    if (hit) return { ...m, canonical_marker_id: hit.id, resolution_source: 'llm_slug' };
  }
  const aliasHit = aliasIndex.get(normalize(m.raw_marker_text));
  if (aliasHit != null) return { ...m, canonical_marker_id: aliasHit, resolution_source: 'alias_match' };
  return { ...m, canonical_marker_id: null, resolution_source: 'unresolved' };
}
