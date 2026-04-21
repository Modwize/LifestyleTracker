// Pluggable LLM adapter for structured extraction.
// Currently Anthropic Claude (vision). Swap providers by implementing the
// same `extractLabPdf` signature.
//
// Privacy:
//   - Anthropic API is zero-retention by default for paid accounts
//   - We send the PDF bytes once, receive structured JSON, discard the bytes
//   - Never log the raw PDF content; only the parsed structured result

export interface ExtractedMarker {
  // What the lab actually printed. Kept verbatim for traceability.
  raw_marker_text: string;
  // Our guess at the canonical slug (matched against canonical_markers.aliases).
  // Null when the LLM isn't confident — user will correct during review.
  canonical_slug: string | null;
  value: number | null;
  unit: string | null;
  reference_low: number | null;
  reference_high: number | null;
  flag: 'low' | 'normal' | 'high' | 'critical' | null;
  notes: string | null;
}

export interface LabExtractionResult {
  drawn_on: string | null;   // 'YYYY-MM-DD'
  lab_name: string | null;
  markers: ExtractedMarker[];
  model: string;
}

// Canonical slugs the LLM is allowed to emit. We pass this into the prompt so
// the model stays inside the vocabulary; unmapped markers come back as null.
export const CANONICAL_SLUGS = [
  'fasting_glucose','hba1c','fasting_insulin','c_peptide','fructosamine',
  'total_cholesterol','ldl_cholesterol','hdl_cholesterol','triglycerides','vldl',
  'apo_b','lp_a','ldl_p',
  'tsh','free_t4','free_t3','reverse_t3','tpo_antibodies',
  'testosterone_total','testosterone_free','shbg','estradiol','dhea_s','cortisol_am',
  'hs_crp','homocysteine','fibrinogen','uric_acid',
  'alt','ast','alp','bilirubin_total','albumin','total_protein','gge_index',
  'bun','creatinine','egfr','sodium','potassium','chloride','co2','calcium',
  'wbc','rbc','hemoglobin','hematocrit','mcv','mch','mchc','rdw','platelets',
  'neutrophils_pct','lymphocytes_pct','monocytes_pct','eosinophils_pct','basophils_pct',
  'vitamin_d_25oh','vitamin_b12','folate','iron','ferritin','tibc','transferrin_sat',
  'magnesium','zinc','omega_check',
] as const;

const SYSTEM_PROMPT = `You are a precise lab report extractor. Extract every reported lab value from the
provided PDF. Return ONLY valid JSON matching the supplied schema — no prose.

Rules:
- For each marker, copy the name EXACTLY as printed into raw_marker_text.
- Map the marker to one of the allowed canonical_slug values when obvious. If
  unsure, set canonical_slug to null; do not guess.
- value must be numeric when possible. If the lab reports '<5' or '>100',
  use the numeric portion (5 or 100 respectively) and add a note.
- unit must be copied verbatim (e.g. 'mg/dL', 'µIU/mL').
- reference_low / reference_high: use the lab's own reference range from the
  report, not a published optimal range.
- flag: set to 'high' or 'low' only if the lab report flags it out of range,
  or if value is clearly outside [reference_low, reference_high]. Use
  'critical' only if the lab explicitly marks it as a critical value.
- drawn_on must be a calendar date in YYYY-MM-DD format; prefer the
  "collected" or "drawn" date over the "reported" date.
- lab_name: the laboratory performing the test (e.g. Quest, LabCorp, Boston Heart).
- Ignore patient identifiers (name, DOB, address, MRN) — do not output them.
- Omit any line that is not a lab result (cover pages, disclaimers, footers).`;

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'document'; source: { type: 'base64'; media_type: string; data: string } }
  >;
}

interface ClaudeResponse {
  content: Array<{ type: string; text?: string }>;
  model: string;
  stop_reason: string;
}

// Extract lab values from a PDF using Claude's vision.
// pdfBytes: raw PDF bytes (typically <5 MB for a lab report).
export async function extractLabPdf(pdfBytes: Uint8Array): Promise<LabExtractionResult> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  const model = Deno.env.get('ANTHROPIC_EXTRACTION_MODEL') ?? 'claude-sonnet-4-6';

  const base64 = encodeBase64(pdfBytes);
  const allowedSlugs = CANONICAL_SLUGS.join('|');

  const userText = `Extract every reported lab value from this PDF.

Respond with a JSON object of this shape:
{
  "drawn_on": "YYYY-MM-DD" | null,
  "lab_name": string | null,
  "markers": [
    {
      "raw_marker_text": string,
      "canonical_slug": one of [${allowedSlugs}] | null,
      "value": number | null,
      "unit": string | null,
      "reference_low": number | null,
      "reference_high": number | null,
      "flag": "low" | "normal" | "high" | "critical" | null,
      "notes": string | null
    }
  ]
}

Return only the JSON object — no preamble, no markdown fences.`;

  const messages: ClaudeMessage[] = [
    {
      role: 'user',
      content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
        { type: 'text', text: userText },
      ],
    },
  ];

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model, max_tokens: 8192, system: SYSTEM_PROMPT, messages }),
  });
  if (!res.ok) {
    throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  }
  const body = (await res.json()) as ClaudeResponse;
  const textBlock = body.content.find((c) => c.type === 'text')?.text ?? '';
  const json = stripJsonFences(textBlock);
  const parsed = JSON.parse(json) as Omit<LabExtractionResult, 'model'>;

  return { ...parsed, model: body.model };
}

// Some models wrap JSON in ```json fences despite instructions. Strip defensively.
function stripJsonFences(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fenced ? fenced[1] : text).trim();
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
