// Scan a barcode or type one in; look up Open Food Facts; classify against
// today's plan. One scan = one food_log row + (if no compliance yet today)
// today's nutrition compliance gets set.

import { createClient } from '@/lib/supabase/server';
import { Card, CardLabel } from '@/components/Card';
import { Header } from '@/components/Header';
import { ScanFlow } from './ScanFlow';

export const dynamic = 'force-dynamic';

interface FoodLogRow {
  id: string;
  product_name: string | null;
  brand: string | null;
  classification: string | null;
  calories: number | null;
  protein_grams: number | null;
  scanned_at: string;
}

export default async function ScanPage({ searchParams }: { searchParams: { saved?: string } }) {
  const supabase = createClient();

  const today = new Date();
  const day = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const { data } = await supabase.from('food_log')
    .select('id,product_name,brand,classification,calories,protein_grams,scanned_at')
    .eq('day', day).order('scanned_at', { ascending: false }).limit(10);
  const log = (data ?? []) as FoodLogRow[];

  return (
    <>
      <Header today={today} />

      <main className="space-y-3 px-3 pb-6">
        <Card>
          <CardLabel>Scan food</CardLabel>
          <p className="mb-3 text-[13px] text-zinc-500">
            Point the camera at a packaged-food barcode, or type it. Uses Open Food Facts.
            Not a calorie tracker — the classification is what sticks to your adherence.
          </p>
          {searchParams.saved === '1' && (
            <p className="mb-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[13px] text-emerald-700 dark:text-emerald-300">
              Saved. Scan another or head back to Log.
            </p>
          )}
          <ScanFlow />
        </Card>

        {log.length > 0 && (
          <Card>
            <CardLabel>Today's scans</CardLabel>
            <ul className="-my-1 divide-y divide-zinc-100 dark:divide-zinc-800">
              {log.map((r) => (
                <li key={r.id} className="flex items-baseline justify-between gap-3 py-2.5">
                  <div className="flex flex-col">
                    <span className="text-[14px]">{r.product_name || 'Unnamed product'}</span>
                    {r.brand && <span className="text-[12px] text-zinc-500">{r.brand}</span>}
                  </div>
                  <div className="flex items-baseline gap-3 text-[12px] tabular-nums text-zinc-500">
                    {r.protein_grams != null && <span>{Math.round(r.protein_grams)}p</span>}
                    {r.calories != null && <span>{Math.round(r.calories)}k</span>}
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800">
                      {r.classification?.replace(/_/g, ' ') ?? '—'}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </main>
    </>
  );
}
