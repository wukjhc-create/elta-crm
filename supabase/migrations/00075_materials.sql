-- =====================================================
-- Migration 00075: Materials catalog (Phase 4)
--
-- A thin layer on top of supplier_products that captures
-- domain-meaningful items ("solar panel", "inverter", "RCD").
-- Each material has a default supplier_product link, default
-- quantity, default unit, and the offer section it belongs to.
-- =====================================================

CREATE TABLE IF NOT EXISTS materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE,                       -- canonical lookup key
  name TEXT NOT NULL,                     -- display name (Danish)
  category TEXT NOT NULL,                 -- solar|inverter|mounting|cable|panel|breaker|rcd|service|general
  section TEXT NOT NULL DEFAULT 'Materialer',  -- offer_line_items.section value
  default_unit TEXT NOT NULL DEFAULT 'stk',
  default_quantity NUMERIC NOT NULL DEFAULT 1,
  search_terms TEXT[] NOT NULL DEFAULT '{}',
  supplier_product_id UUID REFERENCES supplier_products(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_materials_category ON materials(category, is_active);
CREATE INDEX IF NOT EXISTS idx_materials_slug ON materials(slug);
CREATE INDEX IF NOT EXISTS idx_materials_supplier_product ON materials(supplier_product_id);

ALTER TABLE materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "materials_select" ON materials
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "materials_insert" ON materials
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "materials_update" ON materials
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "materials_delete" ON materials
  FOR DELETE TO authenticated USING (true);

GRANT ALL ON materials TO authenticated;
GRANT ALL ON materials TO service_role;

-- =====================================================
-- Seed: canonical Danish materials for el/solcelle
-- Quantities reflect "typical small-residential starter".
-- Sales rep refines per quote.
-- =====================================================

INSERT INTO materials (slug, name, category, section, default_unit, default_quantity, search_terms) VALUES
  ('solar_panel',          'Solpanel',                'solar',     'Solceller',   'stk',  8,
     ARRAY['solpanel','solar panel','pv-modul','solcelle modul']),
  ('solar_inverter',       'Inverter',                'inverter',  'Inverter',    'stk',  1,
     ARRAY['inverter','vekselretter','hybrid inverter','huawei inverter','sma']),
  ('solar_optimizer',      'Optimizer',               'solar',     'Solceller',   'stk',  8,
     ARRAY['optimizer','power optimizer','solaredge optimizer']),
  ('solar_mounting',       'Monteringssystem',        'mounting',  'Montering',   'sæt',  1,
     ARRAY['monteringssystem','mounting','tagskinner','montagebeslag']),
  ('solar_cable',          'Solkabel 6 mm²',          'cable',     'El-arbejde',  'm',   25,
     ARRAY['solkabel','solar kabel','dc kabel','kabel solar','6mm2']),
  ('install_panel_board',  'Eltavle',                 'panel',     'El-arbejde',  'stk',  1,
     ARRAY['eltavle','gruppetavle','tavle']),
  ('install_breaker',      'Gruppeafbryder',          'breaker',   'El-arbejde',  'stk',  8,
     ARRAY['gruppeafbryder','automatsikring','sikring 16a']),
  ('install_rcd',          'Fejlstrømsafbryder (HPFI)','rcd',      'El-arbejde',  'stk',  1,
     ARRAY['fejlstrømsafbryder','rcd','hpfi']),
  ('install_cable_3x25',   'Installationskabel 3x2,5','cable',     'El-arbejde',  'm',   50,
     ARRAY['kabel 3x2,5','installationskabel','3x2.5','3g2,5']),
  ('service_visit',        'Servicebesøg',            'service',   'Service',     'stk',  1,
     ARRAY['servicebesøg','service','udkald']),
  ('service_diagnose',     'Fejlsøgning',             'service',   'Service',     'time', 2,
     ARRAY['fejlsøgning','fejlfinding','diagnose'])
ON CONFLICT (slug) DO NOTHING;
