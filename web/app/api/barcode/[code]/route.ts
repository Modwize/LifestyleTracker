// Open Food Facts barcode lookup proxy. Keeps the UA header under our
// control so we don't get rate-limited into oblivion, and trims the OFF
// response down to just what the UI renders.
//
// Public CC-BY-SA data, no API key required.

import { NextResponse } from 'next/server';

export const runtime = 'edge';

interface OFFProduct {
  product_name?: string;
  product_name_en?: string;
  generic_name?: string;
  brands?: string;
  serving_size?: string;
  nutriments?: {
    'energy-kcal_serving'?: number;
    'energy-kcal_100g'?: number;
    'proteins_serving'?: number;
    'proteins_100g'?: number;
    'carbohydrates_serving'?: number;
    'carbohydrates_100g'?: number;
    'fat_serving'?: number;
    'fat_100g'?: number;
    'sugars_serving'?: number;
    'sugars_100g'?: number;
  };
}

interface OFFResponse {
  status: 0 | 1;
  product?: OFFProduct;
}

export async function GET(
  _req: Request,
  { params }: { params: { code: string } },
) {
  const code = params.code.replace(/[^0-9]/g, '');
  if (!code || code.length < 6 || code.length > 14) {
    return NextResponse.json({ error: 'invalid_barcode' }, { status: 400 });
  }

  const url = `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,product_name_en,generic_name,brands,serving_size,nutriments`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Healthwize/0.1 (personal use)' },
    cache: 'no-store',
  });
  if (!res.ok) return NextResponse.json({ error: 'upstream_error', status: res.status }, { status: 502 });

  const body = (await res.json()) as OFFResponse;
  if (body.status !== 1 || !body.product) {
    return NextResponse.json({ found: false, barcode: code });
  }

  const p = body.product;
  const n = p.nutriments ?? {};
  // Prefer per-serving values; fall back to per-100g when the product doesn't
  // declare a serving size. Flagged in the response so the UI can label it.
  const perServing = n['energy-kcal_serving'] != null;
  return NextResponse.json({
    found: true,
    barcode: code,
    product_name: p.product_name_en || p.product_name || p.generic_name || '',
    brand: p.brands ?? null,
    serving_size: p.serving_size ?? null,
    per_serving: perServing,
    calories: pickNumber(n['energy-kcal_serving'], n['energy-kcal_100g']),
    protein_grams: pickNumber(n.proteins_serving, n.proteins_100g),
    carb_grams: pickNumber(n.carbohydrates_serving, n.carbohydrates_100g),
    fat_grams: pickNumber(n.fat_serving, n.fat_100g),
    sugar_grams: pickNumber(n.sugars_serving, n.sugars_100g),
  });
}

function pickNumber(a?: number, b?: number): number | null {
  if (typeof a === 'number' && Number.isFinite(a)) return a;
  if (typeof b === 'number' && Number.isFinite(b)) return b;
  return null;
}
