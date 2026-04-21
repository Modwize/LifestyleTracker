// Grocery suggestions. Pure function — takes a week's signals, returns a
// short list of items grouped by category with a rationale each.
//
// Spec: avoid full recipe planning. Keep this to 3–8 ingredients that
// tilt next week toward a specific gap (low compliance, plateau, poor sleep,
// high alcohol). Default rotation when nothing specific fires.

export type GroceryCategory = 'protein' | 'vegetable' | 'legume' | 'hydration' | 'recovery_food';

export interface GrocerySuggestion {
  category: GroceryCategory;
  item: string;
  rationale: string;
}

export interface GrocerySignals {
  nutritionComplianceRatio: number;  // 0..1
  adherencePct: number;              // 0..100
  waistChangeInches: number | null;
  sleepMinutesAvg: number;
  alcoholDrinksTotal: number;
  plateauWeeks: number;
}

const DEFAULT_ROTATION: GrocerySuggestion[] = [
  { category: 'protein',   item: 'Wild salmon',       rationale: 'Weekly rotation — omega-3s, favours ApoB if elevated' },
  { category: 'vegetable', item: 'Broccoli',          rationale: 'Weekly rotation — cruciferous + fiber' },
  { category: 'legume',    item: 'Black beans',       rationale: 'Weekly rotation — cheap satiety + protein' },
];

export function selectGrocerySuggestions(s: GrocerySignals): GrocerySuggestion[] {
  const out: GrocerySuggestion[] = [];

  // Low compliance → easy-assembly proteins that reduce friction.
  if (s.nutritionComplianceRatio < 0.7) {
    out.push(
      { category: 'protein', item: 'Rotisserie chicken',        rationale: 'Low-friction on-plan protein for busy days' },
      { category: 'protein', item: 'Greek yogurt, plain 2%',    rationale: 'Fallback protein anchor when breakfast slips' },
      { category: 'protein', item: 'Smoked salmon',             rationale: 'No-cook protein anchor option' },
    );
  }

  // Plateau ≥1 week → fiber + volume without raising calories much.
  if (s.plateauWeeks >= 1) {
    out.push(
      { category: 'vegetable', item: 'Mixed leafy greens (pre-washed)', rationale: 'Volume per calorie while the protocol holds' },
      { category: 'legume',    item: 'Green or brown lentils',          rationale: 'Satiety + fiber during plateau' },
      { category: 'vegetable', item: 'Cauliflower',                     rationale: 'Swap-in for starchier sides to widen deficit' },
    );
  }

  // Sleep < 7h → magnesium-leaning recovery foods.
  if (s.sleepMinutesAvg > 0 && s.sleepMinutesAvg < 420) {
    out.push(
      { category: 'recovery_food', item: 'Pumpkin seeds',        rationale: 'Magnesium — supports sleep quality' },
      { category: 'recovery_food', item: 'Dark chocolate 85%',   rationale: 'Magnesium + small indulgence without spiking glucose' },
    );
  }

  // Alcohol above soft cap → hydration supports.
  if (s.alcoholDrinksTotal >= 5) {
    out.push(
      { category: 'hydration', item: 'Electrolyte mix (LMNT / sodium-heavy)', rationale: 'Offsets alcohol dehydration — same-day & next-morning' },
    );
  }

  // Adherence solid but waist not moving → tilt toward satiety/protein density.
  if (s.adherencePct >= 80 && (s.waistChangeInches == null || Math.abs(s.waistChangeInches) <= 0.1) && s.plateauWeeks < 1) {
    out.push(
      { category: 'protein', item: 'Cottage cheese, low-fat',   rationale: 'High protein per calorie — extends satiety window' },
    );
  }

  // Fallback rotation so every week has at least a short list.
  if (out.length === 0) return DEFAULT_ROTATION.slice();

  // De-duplicate by (category, item) while preserving order.
  const seen = new Set<string>();
  const deduped: GrocerySuggestion[] = [];
  for (const s of out) {
    const k = `${s.category}|${s.item}`;
    if (seen.has(k)) continue;
    seen.add(k);
    deduped.push(s);
  }
  return deduped.slice(0, 8);
}
