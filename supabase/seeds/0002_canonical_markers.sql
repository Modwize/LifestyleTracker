-- 0002_canonical_markers.sql
-- Canonical marker registry. ~65 markers covering the common US lab panels
-- (Quest, LabCorp) plus the commonly-requested "optimal health" markers.
--
-- Idempotent: re-running upserts the row by slug.
--
-- Run after migrations: psql "$SUPABASE_DB_URL" -f supabase/seeds/0002_canonical_markers.sql

\set ON_ERROR_STOP on

insert into public.canonical_markers
  (slug, display_name, loinc_code, panel, unit_default, aliases, derived, sort_order)
values
  -- ── Metabolic ────────────────────────────────────────────────────────────
  ('fasting_glucose',    'Fasting glucose',    '1558-6', 'metabolic', 'mg/dL', array['glucose','glucose fasting','fasting blood sugar'], false, 10),
  ('hba1c',              'Hemoglobin A1c',     '4548-4', 'metabolic', '%',     array['hba1c','a1c','hemoglobin a1c','glycated hemoglobin','glycohemoglobin'], false, 20),
  ('fasting_insulin',    'Fasting insulin',    '1558-6', 'metabolic', 'µIU/mL',array['insulin','insulin fasting'], false, 30),
  ('homa_ir',            'HOMA-IR',            null,     'metabolic', null,    array[]::text[], true, 40),
  ('c_peptide',          'C-peptide',          '1986-9', 'metabolic', 'ng/mL', array['c peptide','c-peptide'], false, 50),
  ('fructosamine',       'Fructosamine',       '1558-6', 'metabolic', 'µmol/L',array[]::text[], false, 60),

  -- ── Lipid / cardiovascular ───────────────────────────────────────────────
  ('total_cholesterol',  'Total cholesterol',  '2093-3', 'lipid',     'mg/dL', array['cholesterol total','cholesterol'], false, 10),
  ('ldl_cholesterol',    'LDL cholesterol',    '2089-1', 'lipid',     'mg/dL', array['ldl','ldl-c','ldl cholesterol calc','ldl direct'], false, 20),
  ('hdl_cholesterol',    'HDL cholesterol',    '2085-9', 'lipid',     'mg/dL', array['hdl','hdl-c'], false, 30),
  ('triglycerides',      'Triglycerides',      '2571-8', 'lipid',     'mg/dL', array['tg','trigs'], false, 40),
  ('non_hdl_cholesterol','Non-HDL cholesterol','43396-1','lipid',     'mg/dL', array['non hdl'], true, 50),
  ('vldl',               'VLDL',               '13458-5','lipid',     'mg/dL', array['vldl calc'], false, 60),
  ('tc_hdl_ratio',       'TC / HDL ratio',     null,     'lipid',     null,    array[]::text[], true, 70),
  ('tg_hdl_ratio',       'TG / HDL ratio',     null,     'lipid',     null,    array[]::text[], true, 80),
  ('apo_b',              'ApoB',               '1884-6', 'lipid',     'mg/dL', array['apolipoprotein b'], false, 90),
  ('lp_a',               'Lp(a)',              '10835-7','lipid',     'nmol/L',array['lipoprotein a','lipoprotein(a)'], false, 100),
  ('ldl_p',              'LDL-P (particle #)', '54434-2','lipid',     'nmol/L',array['ldl particle number'], false, 110),

  -- ── Thyroid ──────────────────────────────────────────────────────────────
  ('tsh',                'TSH',                '3016-3', 'thyroid',   'µIU/mL',array['thyroid stimulating hormone'], false, 10),
  ('free_t4',            'Free T4',            '3024-7', 'thyroid',   'ng/dL', array['ft4','thyroxine free'], false, 20),
  ('free_t3',            'Free T3',            '3051-0', 'thyroid',   'pg/mL', array['ft3','triiodothyronine free'], false, 30),
  ('reverse_t3',         'Reverse T3',         '30355-8','thyroid',   'ng/dL', array['rt3'], false, 40),
  ('tpo_antibodies',     'TPO antibodies',     '8099-0', 'thyroid',   'IU/mL', array['anti-tpo','thyroid peroxidase antibodies'], false, 50),

  -- ── Hormones ─────────────────────────────────────────────────────────────
  ('testosterone_total', 'Total testosterone', '2986-8', 'hormone',   'ng/dL', array['testosterone','t total'], false, 10),
  ('testosterone_free',  'Free testosterone',  '2991-8', 'hormone',   'pg/mL', array['t free','free t'], false, 20),
  ('shbg',               'SHBG',               '13967-5','hormone',   'nmol/L',array['sex hormone binding globulin'], false, 30),
  ('estradiol',          'Estradiol',          '14715-7','hormone',   'pg/mL', array['e2'], false, 40),
  ('dhea_s',             'DHEA-S',             '2191-5', 'hormone',   'µg/dL', array['dhea sulfate','dheas'], false, 50),
  ('cortisol_am',        'Cortisol (AM)',      '2143-6', 'hormone',   'µg/dL', array['cortisol morning','cortisol'], false, 60),

  -- ── Inflammation / advanced ──────────────────────────────────────────────
  ('hs_crp',             'hs-CRP',             '30522-7','inflammation','mg/L',array['high sensitivity crp','c reactive protein hs'], false, 10),
  ('homocysteine',       'Homocysteine',       '13965-9','inflammation','µmol/L',array[]::text[], false, 20),
  ('fibrinogen',         'Fibrinogen',         '3255-7', 'inflammation','mg/dL',array[]::text[], false, 30),
  ('uric_acid',          'Uric acid',          '3084-1', 'inflammation','mg/dL',array[]::text[], false, 40),
  ('gge_index',          'GGT',                '2324-2', 'liver',     'U/L',   array['gamma-gt','gamma glutamyl transferase'], false, 50),

  -- ── Liver ────────────────────────────────────────────────────────────────
  ('alt',                'ALT',                '1742-6', 'liver',     'U/L',   array['alanine aminotransferase','sgpt'], false, 10),
  ('ast',                'AST',                '1920-8', 'liver',     'U/L',   array['aspartate aminotransferase','sgot'], false, 20),
  ('alp',                'Alkaline phosphatase','6768-6','liver',     'U/L',   array['alkaline phos','alp'], false, 30),
  ('bilirubin_total',    'Total bilirubin',    '1975-2', 'liver',     'mg/dL', array['bilirubin'], false, 40),
  ('albumin',            'Albumin',            '1751-7', 'liver',     'g/dL',  array[]::text[], false, 50),
  ('total_protein',      'Total protein',      '2885-2', 'liver',     'g/dL',  array['protein total'], false, 60),

  -- ── Kidney ───────────────────────────────────────────────────────────────
  ('bun',                'BUN',                '3094-0', 'kidney',    'mg/dL', array['urea nitrogen','blood urea nitrogen'], false, 10),
  ('creatinine',         'Creatinine',         '2160-0', 'kidney',    'mg/dL', array[]::text[], false, 20),
  ('egfr',               'eGFR',               '62238-1','kidney',    'mL/min',array['estimated gfr','egfr calc'], false, 30),
  ('sodium',             'Sodium',             '2951-2', 'kidney',    'mmol/L',array['na'], false, 40),
  ('potassium',          'Potassium',          '2823-3', 'kidney',    'mmol/L',array['k'], false, 50),
  ('chloride',           'Chloride',           '2075-0', 'kidney',    'mmol/L',array['cl'], false, 60),
  ('co2',                'CO2',                '2028-9', 'kidney',    'mmol/L',array['carbon dioxide','bicarbonate'], false, 70),
  ('calcium',            'Calcium',            '17861-6','kidney',    'mg/dL', array['ca'], false, 80),

  -- ── CBC with diff ────────────────────────────────────────────────────────
  ('wbc',                'WBC',                '6690-2', 'cbc',       'x10^3/µL',array['white blood cells','leukocytes'], false, 10),
  ('rbc',                'RBC',                '789-8',  'cbc',       'x10^6/µL',array['red blood cells','erythrocytes'], false, 20),
  ('hemoglobin',         'Hemoglobin',         '718-7',  'cbc',       'g/dL',  array['hgb','hb'], false, 30),
  ('hematocrit',         'Hematocrit',         '4544-3', 'cbc',       '%',     array['hct'], false, 40),
  ('mcv',                'MCV',                '787-2',  'cbc',       'fL',    array[]::text[], false, 50),
  ('mch',                'MCH',                '785-6',  'cbc',       'pg',    array[]::text[], false, 60),
  ('mchc',               'MCHC',               '786-4',  'cbc',       'g/dL',  array[]::text[], false, 70),
  ('rdw',                'RDW',                '788-0',  'cbc',       '%',     array['red cell distribution width'], false, 80),
  ('platelets',          'Platelets',          '777-3',  'cbc',       'x10^3/µL',array['plt','plt count'], false, 90),
  ('neutrophils_pct',    'Neutrophils %',      '770-8',  'cbc',       '%',     array[]::text[], false, 100),
  ('lymphocytes_pct',    'Lymphocytes %',      '736-9',  'cbc',       '%',     array[]::text[], false, 110),
  ('monocytes_pct',      'Monocytes %',        '5905-5', 'cbc',       '%',     array[]::text[], false, 120),
  ('eosinophils_pct',    'Eosinophils %',      '713-8',  'cbc',       '%',     array[]::text[], false, 130),
  ('basophils_pct',      'Basophils %',        '706-2',  'cbc',       '%',     array[]::text[], false, 140),

  -- ── Nutrients ────────────────────────────────────────────────────────────
  ('vitamin_d_25oh',     'Vitamin D, 25-OH',   '62292-8','nutrients', 'ng/mL', array['25 hydroxyvitamin d','vit d','vitamin d'], false, 10),
  ('vitamin_b12',        'Vitamin B12',        '2132-9', 'nutrients', 'pg/mL', array['b12','cobalamin'], false, 20),
  ('folate',             'Folate',             '2284-8', 'nutrients', 'ng/mL', array['folic acid','folate serum'], false, 30),
  ('iron',               'Iron',               '2498-4', 'nutrients', 'µg/dL', array['serum iron'], false, 40),
  ('ferritin',           'Ferritin',           '2276-4', 'nutrients', 'ng/mL', array[]::text[], false, 50),
  ('tibc',               'TIBC',               '2500-7', 'nutrients', 'µg/dL', array['total iron binding capacity'], false, 60),
  ('transferrin_sat',    'Transferrin saturation','2502-3','nutrients','%',    array['iron saturation','iron sat'], false, 70),
  ('magnesium',           'Magnesium',          '2601-3', 'nutrients', 'mg/dL', array['mg'], false, 80),
  ('zinc',               'Zinc',               '5763-8', 'nutrients', 'µg/dL', array['zn'], false, 90),
  ('omega_check',        'OmegaCheck (EPA+DHA)',null,    'nutrients', '%',     array['omega-3 index','omega 3'], false, 100)
on conflict (slug) do update set
  display_name = excluded.display_name,
  loinc_code   = excluded.loinc_code,
  panel        = excluded.panel,
  unit_default = excluded.unit_default,
  aliases      = excluded.aliases,
  derived      = excluded.derived,
  sort_order   = excluded.sort_order;

-- Record the derivation formulas on the derived rows.
update public.canonical_markers set derivation_formula = '(fasting_glucose × fasting_insulin) / 405' where slug = 'homa_ir';
update public.canonical_markers set derivation_formula = 'total_cholesterol / hdl_cholesterol'       where slug = 'tc_hdl_ratio';
update public.canonical_markers set derivation_formula = 'triglycerides / hdl_cholesterol'           where slug = 'tg_hdl_ratio';
update public.canonical_markers set derivation_formula = 'total_cholesterol − hdl_cholesterol'       where slug = 'non_hdl_cholesterol';

select count(*) as seeded_markers from public.canonical_markers;
