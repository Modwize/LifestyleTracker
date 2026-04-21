'use client';

// Top-level scan flow state. Handles: scanner → lookup → confirm → submit.

import { useState, useTransition } from 'react';
import { BarcodeScanner } from './BarcodeScanner';
import { saveScannedFood } from './actions';

interface ProductLookup {
  found: boolean;
  barcode: string;
  product_name?: string | null;
  brand?: string | null;
  serving_size?: string | null;
  per_serving?: boolean;
  calories?: number | null;
  protein_grams?: number | null;
  carb_grams?: number | null;
  fat_grams?: number | null;
  sugar_grams?: number | null;
}

export function ScanFlow() {
  const [code, setCode] = useState<string>('');
  const [product, setProduct] = useState<ProductLookup | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function lookup(rawCode: string) {
    const cleaned = rawCode.replace(/[^0-9]/g, '');
    if (!cleaned) return;
    setCode(cleaned);
    setError(null);
    setLoading(true);
    try {
      const r = await fetch(`/api/barcode/${cleaned}`);
      if (!r.ok) throw new Error(`Lookup failed (${r.status})`);
      const data = (await r.json()) as ProductLookup;
      setProduct(data);
      if (!data.found) setError('No match in Open Food Facts. Save manually below.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lookup failed');
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setProduct(null);
    setCode('');
    setError(null);
  }

  return (
    <div className="space-y-3">
      {!product && (
        <>
          <BarcodeScanner onDetected={(c) => void lookup(c)} />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              void lookup(String(fd.get('code') ?? ''));
            }}
            className="grid grid-cols-[1fr_auto] gap-2"
          >
            <input
              required
              type="text"
              name="code"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="Barcode"
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-[15px] tabular-nums outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:focus:border-zinc-600"
            />
            <button
              type="submit"
              disabled={loading}
              className="h-10 rounded-xl bg-zinc-900 px-4 text-[14px] font-medium text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
            >
              {loading ? 'Looking…' : 'Lookup'}
            </button>
          </form>
          {error && <p className="text-[13px] text-amber-600">{error}</p>}
        </>
      )}

      {product && (
        <form
          action={(fd) => startTransition(() => void saveScannedFood(fd))}
          className="space-y-3"
        >
          <input type="hidden" name="barcode" value={code} />
          <input type="hidden" name="product_name" value={product.product_name ?? ''} />
          <input type="hidden" name="brand" value={product.brand ?? ''} />
          <input type="hidden" name="serving_size" value={product.serving_size ?? ''} />
          <input type="hidden" name="calories" value={product.calories ?? ''} />
          <input type="hidden" name="protein_grams" value={product.protein_grams ?? ''} />
          <input type="hidden" name="carb_grams" value={product.carb_grams ?? ''} />
          <input type="hidden" name="fat_grams" value={product.fat_grams ?? ''} />
          <input type="hidden" name="sugar_grams" value={product.sugar_grams ?? ''} />

          <div className="space-y-1">
            <p className="text-[15px] font-medium">
              {product.product_name || 'Unknown product'}
            </p>
            {product.brand && <p className="text-[13px] text-zinc-500">{product.brand}</p>}
            <p className="text-[12px] tabular-nums text-zinc-500">
              Barcode {code}{product.serving_size ? ` · ${product.serving_size}` : ''}
              {product.found === false ? ' · no OFF match' : ''}
            </p>
          </div>

          {(product.calories != null || product.protein_grams != null) && (
            <div className="grid grid-cols-4 gap-2 text-[12px] tabular-nums">
              <Stat label="kcal" value={fmt(product.calories)} />
              <Stat label="prot" value={fmt(product.protein_grams)} />
              <Stat label="carb" value={fmt(product.carb_grams)} />
              <Stat label="fat"  value={fmt(product.fat_grams)} />
            </div>
          )}
          {product.per_serving === false && product.calories != null && (
            <p className="text-[11px] text-zinc-500">Values shown per 100g (no serving size reported).</p>
          )}

          <div className="space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">
              Classify against today's plan
            </p>
            <div className="grid grid-cols-2 gap-2">
              <ComplianceButton value="fully_compliant" label="Fully" pending={pending} />
              <ComplianceButton value="mostly_compliant" label="Mostly" pending={pending} />
              <ComplianceButton value="off_plan_recovered" label="Recovered" pending={pending} />
              <ComplianceButton value="off_plan" label="Off plan" pending={pending} />
            </div>
          </div>

          <button
            type="button"
            onClick={reset}
            className="w-full rounded-xl border border-zinc-200 px-4 py-2 text-[13px] font-medium text-zinc-500 dark:border-zinc-800"
          >
            Scan another
          </button>
        </form>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col rounded-lg bg-zinc-100 px-2 py-1.5 text-center dark:bg-zinc-800">
      <span className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</span>
      <span className="text-[13px]">{value}</span>
    </div>
  );
}

function ComplianceButton({ value, label, pending }: { value: string; label: string; pending: boolean }) {
  return (
    <button
      type="submit"
      name="classification"
      value={value}
      disabled={pending}
      className="h-11 rounded-xl border border-zinc-200 bg-white px-3 text-[14px] font-medium text-zinc-900 transition hover:border-zinc-400 active:bg-zinc-900 active:text-white disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-zinc-600"
    >
      {label}
    </button>
  );
}

function fmt(n: number | null | undefined): string {
  if (n == null) return '—';
  return Math.round(n * 10) / 10 + '';
}
