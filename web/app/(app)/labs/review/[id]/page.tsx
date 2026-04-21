// Review the LLM-extracted markers before they become canonical bloodwork rows.
// User can uncheck anything that looks wrong, override the canonical mapping,
// and edit the value — then confirm to commit.

import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Card, CardLabel } from '@/components/Card';
import { Header } from '@/components/Header';
import { confirmLabDraw, deleteLabDraw } from '../../actions';

export const dynamic = 'force-dynamic';

interface ResolvedMarker {
  raw_marker_text: string;
  canonical_slug: string | null;
  canonical_marker_id: number | null;
  resolution_source: 'llm_slug' | 'alias_match' | 'unresolved';
  value: number | null;
  unit: string | null;
  reference_low: number | null;
  reference_high: number | null;
  flag: 'low' | 'normal' | 'high' | 'critical' | null;
  notes: string | null;
}

interface LabDraw {
  id: string;
  state: string;
  drawn_on: string | null;
  lab_name: string | null;
  extraction_payload: {
    resolved?: ResolvedMarker[];
    drawn_on?: string | null;
    lab_name?: string | null;
  } | null;
  extraction_error: string | null;
}

export default async function ReviewDrawPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: draw } = await supabase.from('lab_draws')
    .select('id,state,drawn_on,lab_name,extraction_payload,extraction_error').eq('id', params.id).maybeSingle();
  if (!draw) notFound();
  const d = draw as LabDraw;

  if (d.state === 'uploaded' || d.state === 'extracting') {
    return <ExtractingPending id={params.id} />;
  }
  if (d.state === 'failed') {
    return <ExtractionFailed id={params.id} error={d.extraction_error} />;
  }

  const resolved = d.extraction_payload?.resolved ?? [];
  const defaultDrawnOn = d.drawn_on ?? d.extraction_payload?.drawn_on ?? '';
  const defaultLabName = d.lab_name ?? d.extraction_payload?.lab_name ?? '';

  // For the override dropdown.
  const { data: allMarkers } = await supabase.from('canonical_markers')
    .select('slug,display_name,panel').order('panel').order('sort_order');
  const markers = (allMarkers ?? []) as Array<{ slug: string; display_name: string; panel: string }>;

  return (
    <>
      <Header today={new Date()} />

      <main className="space-y-3 px-3 pb-6">
        <form action={confirmLabDraw} className="space-y-3">
          <input type="hidden" name="draw_id" value={d.id} />

          <Card>
            <CardLabel>Review — draw info</CardLabel>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Drawn on" name="drawn_on" type="date" defaultValue={defaultDrawnOn ?? ''} />
              <Field label="Lab" name="lab_name" defaultValue={defaultLabName ?? ''} placeholder="Quest, LabCorp, ..." />
            </div>
          </Card>

          <Card>
            <CardLabel>Extracted markers ({resolved.length})</CardLabel>
            <p className="mb-3 text-[12px] text-zinc-500">
              Uncheck anything you don't want to store. Fix the canonical mapping where "Unmapped" appears.
            </p>
            <ul className="-my-1 divide-y divide-zinc-100 dark:divide-zinc-800">
              {resolved.map((m, i) => (
                <li key={`${i}-${m.raw_marker_text}`} className="py-2.5">
                  <div className="flex items-start gap-3">
                    <input
                      id={`keep_${i}`} type="checkbox" name={`keep_${i}`}
                      defaultChecked={m.canonical_marker_id != null}
                      className="mt-1 h-4 w-4 accent-zinc-900 dark:accent-zinc-50"
                    />
                    <div className="flex-1 space-y-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <label htmlFor={`keep_${i}`} className="text-[14px]">
                          {m.raw_marker_text}
                        </label>
                        <ResolutionTag source={m.resolution_source} />
                      </div>
                      <div className="grid grid-cols-[1fr_auto] gap-2">
                        <select
                          name={`slug_${i}`}
                          defaultValue={m.canonical_slug ?? ''}
                          className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-[12px] dark:border-zinc-800 dark:bg-zinc-900"
                        >
                          <option value="">Unmapped</option>
                          {markers.map((cm) => (
                            <option key={cm.slug} value={cm.slug}>
                              {cm.display_name}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number" step="any" name={`value_${i}`}
                          defaultValue={m.value ?? ''}
                          placeholder="Value"
                          className="w-24 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-right text-[12px] tabular-nums dark:border-zinc-800 dark:bg-zinc-900"
                        />
                      </div>
                      <div className="flex items-baseline gap-3 text-[11px] text-zinc-500 tabular-nums">
                        {m.unit && <span>{m.unit}</span>}
                        {(m.reference_low != null || m.reference_high != null) && (
                          <span>ref {m.reference_low ?? '–'}–{m.reference_high ?? '–'}</span>
                        )}
                        {m.flag && <span className="uppercase tracking-wider">{m.flag}</span>}
                      </div>
                      {m.notes && <p className="text-[11px] text-zinc-500">{m.notes}</p>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="submit"
              className="rounded-xl bg-zinc-900 px-4 py-2.5 text-[14px] font-medium text-white dark:bg-zinc-50 dark:text-zinc-900"
            >
              Confirm & save
            </button>
          </div>
        </form>

        <form action={deleteLabDraw}>
          <input type="hidden" name="draw_id" value={d.id} />
          <button
            type="submit"
            className="w-full rounded-xl border border-zinc-200 bg-transparent px-4 py-2.5 text-[13px] font-medium text-zinc-500 dark:border-zinc-800"
          >
            Discard draw & delete PDF
          </button>
        </form>
      </main>
    </>
  );
}

function Field({ label, name, type = 'text', defaultValue, placeholder }: {
  label: string; name: string; type?: string; defaultValue?: string; placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">{label}</span>
      <input
        type={type} name={name} defaultValue={defaultValue} placeholder={placeholder}
        className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-[14px] dark:border-zinc-800 dark:bg-zinc-900"
      />
    </label>
  );
}

function ResolutionTag({ source }: { source: ResolvedMarker['resolution_source'] }) {
  const label =
    source === 'llm_slug' ? 'Mapped' :
    source === 'alias_match' ? 'Alias matched' :
    'Unmapped';
  const cls =
    source === 'unresolved'
      ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
      : 'border-zinc-300 bg-zinc-100 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400';
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wider ${cls}`}>
      {label}
    </span>
  );
}

function ExtractingPending({ id }: { id: string }) {
  return (
    <>
      <Header today={new Date()} />
      <main className="px-3 pb-6">
        <Card>
          <CardLabel>Extracting…</CardLabel>
          <p className="text-[13px] text-zinc-500">
            Claude is reading the PDF. Refresh in a moment — this usually takes 10–30 seconds.
          </p>
          <form action="" method="get" className="mt-3">
            <button
              formAction={`/labs/review/${id}`}
              className="rounded-xl border border-zinc-200 px-3 py-1.5 text-[13px] dark:border-zinc-800"
            >
              Refresh
            </button>
          </form>
        </Card>
      </main>
    </>
  );
}

function ExtractionFailed({ id, error }: { id: string; error: string | null }) {
  return (
    <>
      <Header today={new Date()} />
      <main className="px-3 pb-6">
        <Card>
          <CardLabel>Extraction failed</CardLabel>
          <p className="mb-3 text-[13px] text-zinc-500">{error ?? 'Unknown error.'}</p>
          <form action={deleteLabDraw}>
            <input type="hidden" name="draw_id" value={id} />
            <button className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-[13px] dark:border-zinc-800">
              Discard draw & delete PDF
            </button>
          </form>
        </Card>
      </main>
    </>
  );
}
