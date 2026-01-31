-- =====================================================
-- Migration: 00030_quick_jobs_and_presets.sql
-- Description: Phase B - Quick Jobs and Calibration Presets
-- Date: 2026-01-31
-- =====================================================

-- =====================================================
-- PART 1: QUICK JOBS - Pre-built calculation templates
-- =====================================================

CREATE TABLE IF NOT EXISTS quick_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  icon TEXT DEFAULT 'Zap',

  -- Pre-configured components (array of component configs)
  components JSONB NOT NULL DEFAULT '[]',
  -- Structure: [{ component_code, variant_code, quantity, notes }]

  -- Estimates (auto-calculated or manual)
  estimated_time_minutes INTEGER DEFAULT 0,
  estimated_cost_price DECIMAL(10, 2) DEFAULT 0,
  estimated_sale_price DECIMAL(10, 2) DEFAULT 0,

  -- Default building profile
  default_building_profile_code TEXT DEFAULT 'HOUSE',

  -- Display settings
  is_featured BOOLEAN DEFAULT false,
  usage_count INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,

  -- Status
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_quick_jobs_category ON quick_jobs(category);
CREATE INDEX idx_quick_jobs_active ON quick_jobs(is_active) WHERE is_active = true;
CREATE INDEX idx_quick_jobs_featured ON quick_jobs(is_featured) WHERE is_featured = true;

-- Trigger for updated_at
CREATE TRIGGER update_quick_jobs_updated_at
  BEFORE UPDATE ON quick_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- PART 2: CALIBRATION PRESETS - Saveable factor configurations
-- =====================================================

CREATE TABLE IF NOT EXISTS calibration_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,

  -- Factor overrides (merged with global factors)
  factor_overrides JSONB NOT NULL DEFAULT '{}',
  -- Structure: { factor_key: value, ... }

  -- Building profile override
  default_building_profile_id UUID REFERENCES kalkia_building_profiles(id),

  -- Settings overrides
  hourly_rate DECIMAL(10, 2),
  margin_percentage DECIMAL(5, 2),

  -- Metadata
  category TEXT DEFAULT 'custom',
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,

  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_calibration_presets_active ON calibration_presets(is_active) WHERE is_active = true;
CREATE UNIQUE INDEX idx_calibration_presets_default ON calibration_presets(is_default) WHERE is_default = true;

CREATE TRIGGER update_calibration_presets_updated_at
  BEFORE UPDATE ON calibration_presets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- PART 3: SEED QUICK JOBS - Common electrical work
-- =====================================================

INSERT INTO quick_jobs (code, name, description, category, icon, is_featured, sort_order, components, estimated_time_minutes) VALUES

-- Residential - Featured
('QJ-VILLA-STD', 'Villa standard el-installation', 'Komplet el-installation til standard parcelhus 120-180m². Inkluderer stikkontakter, afbrydere, lampeudtag og tavlearbejde.', 'residential', 'Home', true, 1,
'[
  {"component_code": "STIK-1-NY", "variant_code": "GIPS", "quantity": 25, "notes": "Stuer, soveværelser, køkken"},
  {"component_code": "STIK-DBL-NY", "variant_code": "GIPS", "quantity": 8, "notes": "Køkken, bryggers"},
  {"component_code": "STIK-USB-NY", "variant_code": "GIPS", "quantity": 4, "notes": "Soveværelser, stue"},
  {"component_code": "AFB-1P-NY", "variant_code": "GIPS", "quantity": 12, "notes": "Alle rum"},
  {"component_code": "AFB-KORR-NY", "variant_code": "GIPS", "quantity": 4, "notes": "Gange, trappe"},
  {"component_code": "LOFT-NY", "variant_code": "GIPS", "quantity": 10, "notes": "Alle rum"},
  {"component_code": "SPOT-LED-NY", "variant_code": "GIPS", "quantity": 12, "notes": "Køkken, bad, entre"},
  {"component_code": "GRP-NY", "variant_code": null, "quantity": 8, "notes": "Nye grupper i tavle"}
]'::jsonb, 840),

('QJ-LEJ-STD', 'Lejlighed standard el', 'Standard el-installation til lejlighed 60-90m². Typisk 2-3 værelser.', 'residential', 'Building2', true, 2,
'[
  {"component_code": "STIK-1-NY", "variant_code": "BETON", "quantity": 15, "notes": "Alle rum"},
  {"component_code": "STIK-DBL-NY", "variant_code": "BETON", "quantity": 4, "notes": "Køkken"},
  {"component_code": "AFB-1P-NY", "variant_code": "BETON", "quantity": 8, "notes": "Alle rum"},
  {"component_code": "LOFT-NY", "variant_code": "BETON", "quantity": 6, "notes": "Alle rum"},
  {"component_code": "SPOT-LED-NY", "variant_code": "GIPS", "quantity": 6, "notes": "Køkken, bad"},
  {"component_code": "GRP-NY", "variant_code": null, "quantity": 4, "notes": "Nye grupper"}
]'::jsonb, 480),

('QJ-RENOV-RUM', 'Renovering enkelt rum', 'Komplet el-renovering af et enkelt rum inkl. nye stikkontakter, afbrydere og belysning.', 'renovation', 'Hammer', true, 3,
'[
  {"component_code": "STIK-1-NY", "variant_code": "GIPS", "quantity": 4, "notes": "Nye placeringer"},
  {"component_code": "STIK-1-UDSK", "variant_code": "GIPS", "quantity": 2, "notes": "Udskiftning af gamle"},
  {"component_code": "AFB-1P-NY", "variant_code": "GIPS", "quantity": 2, "notes": "Ny + udskiftning"},
  {"component_code": "LOFT-NY", "variant_code": "GIPS", "quantity": 1, "notes": "Nyt lampeudtag"},
  {"component_code": "SPOT-LED-NY", "variant_code": "GIPS", "quantity": 4, "notes": "Spots i loft"}
]'::jsonb, 180),

-- Kitchen & Bath
('QJ-KOEKKEN', 'Køkken el-pakke', 'Komplet el-installation til nyt køkken. Stikkontakter, hårde hvidevarer, belysning.', 'kitchen-bath', 'ChefHat', true, 4,
'[
  {"component_code": "STIK-DBL-NY", "variant_code": "GIPS", "quantity": 6, "notes": "Bordplade niveau"},
  {"component_code": "STIK-1-NY", "variant_code": "GIPS", "quantity": 4, "notes": "Skjulte til hvidevarer"},
  {"component_code": "HV-KOMFUR", "variant_code": "NY", "quantity": 1, "notes": "Komfur/kogesektion"},
  {"component_code": "HV-EMH", "variant_code": "STD", "quantity": 1, "notes": "Emhætte"},
  {"component_code": "HV-OVN", "variant_code": "NY", "quantity": 1, "notes": "Ovn separat"},
  {"component_code": "HV-OPV", "variant_code": "STD", "quantity": 1, "notes": "Opvaskemaskine"},
  {"component_code": "SPOT-LED-NY", "variant_code": "GIPS", "quantity": 6, "notes": "Spots over bordplade"},
  {"component_code": "LOFT-NY", "variant_code": "GIPS", "quantity": 1, "notes": "Hovedbelysning"},
  {"component_code": "AFB-1P-NY", "variant_code": "GIPS", "quantity": 2, "notes": "Afbrydere"}
]'::jsonb, 360),

('QJ-BAD', 'Badeværelse el-pakke', 'Komplet el til badeværelse inkl. spots, ventilator og gulvvarme.', 'kitchen-bath', 'Bath', false, 5,
'[
  {"component_code": "STIK-IP44-NY", "variant_code": "GIPS", "quantity": 2, "notes": "IP44 ved håndvask"},
  {"component_code": "AFB-1P-NY", "variant_code": "GIPS", "quantity": 1, "notes": "Hovedlys"},
  {"component_code": "SPOT-LED-NY", "variant_code": "GIPS", "quantity": 4, "notes": "IP44 spots"},
  {"component_code": "LOFT-NY", "variant_code": "GIPS", "quantity": 1, "notes": "Hovedbelysning"}
]'::jsonb, 180),

-- Outdoor & EV
('QJ-EV-LADER', 'EV-lader installation', 'Komplet installation af elbil-lader inkl. kabel og sikring.', 'outdoor', 'Car', true, 6,
'[
  {"component_code": "EV-LADER", "variant_code": "11KW", "quantity": 1, "notes": "11kW lader"},
  {"component_code": "GRP-NY", "variant_code": null, "quantity": 1, "notes": "Dedikeret gruppe"},
  {"component_code": "KABEL-M", "variant_code": "5G6", "quantity": 15, "notes": "Kabel til lader"}
]'::jsonb, 180),

('QJ-CARPORT', 'Carport/garage el', 'El-installation til carport eller garage med lys og stik.', 'outdoor', 'Warehouse', false, 7,
'[
  {"component_code": "STIK-IP54-NY", "variant_code": "TRAE", "quantity": 2, "notes": "IP54 udendørs"},
  {"component_code": "AFB-1P-NY", "variant_code": "TRAE", "quantity": 1, "notes": "Lys afbryder"},
  {"component_code": "LOFT-IP44-NY", "variant_code": "TRAE", "quantity": 2, "notes": "Loftlamper"},
  {"component_code": "KABEL-M", "variant_code": "3G25", "quantity": 20, "notes": "Forsyningskabel"}
]'::jsonb, 240),

-- Panel work
('QJ-TAVLE-UDV', 'Tavleudvidelse', 'Udvidelse af eksisterende el-tavle med nye grupper.', 'panel', 'LayoutGrid', false, 8,
'[
  {"component_code": "GRP-NY", "variant_code": null, "quantity": 4, "notes": "Nye automatsikringer"},
  {"component_code": "HPFI-TEST", "variant_code": null, "quantity": 1, "notes": "Test og dokumentation"}
]'::jsonb, 90),

('QJ-TAVLE-NY', 'Ny gruppetavle', 'Installation af ny gruppetavle med grundlæggende grupper.', 'panel', 'LayoutGrid', false, 9,
'[
  {"component_code": "TAVLE-NY", "variant_code": "12MOD", "quantity": 1, "notes": "12-modul tavle"},
  {"component_code": "GRP-NY", "variant_code": null, "quantity": 6, "notes": "Grundgrupper"},
  {"component_code": "HPFI-TEST", "variant_code": null, "quantity": 1, "notes": "Test og dokumentation"}
]'::jsonb, 180),

-- Service work
('QJ-SERVICE-STIK', 'Service: Udskift stikkontakter', 'Udskiftning af slidte/defekte stikkontakter.', 'service', 'Wrench', false, 10,
'[
  {"component_code": "STIK-1-UDSK", "variant_code": "GIPS", "quantity": 5, "notes": "Udskiftning"}
]'::jsonb, 75),

('QJ-SERVICE-AFB', 'Service: Udskift afbrydere', 'Udskiftning af slidte/defekte afbrydere.', 'service', 'Wrench', false, 11,
'[
  {"component_code": "AFB-1P-UDSK", "variant_code": "GIPS", "quantity": 5, "notes": "Udskiftning"}
]'::jsonb, 50),

('QJ-FEJLFIND', 'Fejlfinding el', 'Generel fejlfinding på el-installation. Tid er estimat.', 'service', 'Search', false, 12,
'[
  {"component_code": "HPFI-TEST", "variant_code": null, "quantity": 1, "notes": "HPFI test"},
  {"component_code": "FEJLFIND", "variant_code": null, "quantity": 1, "notes": "Fejlfinding 1 time"}
]'::jsonb, 60)

ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  icon = EXCLUDED.icon,
  is_featured = EXCLUDED.is_featured,
  sort_order = EXCLUDED.sort_order,
  components = EXCLUDED.components,
  estimated_time_minutes = EXCLUDED.estimated_time_minutes;

-- =====================================================
-- PART 4: SEED CALIBRATION PRESETS
-- =====================================================

INSERT INTO calibration_presets (code, name, description, category, is_default, factor_overrides, hourly_rate, margin_percentage) VALUES

('CAL-STD', 'Standard kalkulation', 'Standard indstillinger til dagligt arbejde. Balanceret mellem tid og pris.', 'standard', true,
'{"indirect_time": 15, "personal_time": 8, "overhead": 12, "material_waste": 5}'::jsonb, 495, 15),

('CAL-BUDGET', 'Budget-venlig', 'Reduceret avance og overhead til prisfølsomme projekter.', 'budget',  false,
'{"indirect_time": 12, "personal_time": 6, "overhead": 8, "material_waste": 5}'::jsonb, 450, 10),

('CAL-PREMIUM', 'Premium service', 'Højere marginer til kvalitetsprojekter med ekstra service.', 'premium', false,
'{"indirect_time": 18, "personal_time": 10, "overhead": 15, "material_waste": 5}'::jsonb, 550, 22),

('CAL-RUSH', 'Hastearbejde', 'Forhøjede satser til akut/haste arbejde.', 'special', false,
'{"indirect_time": 10, "personal_time": 5, "overhead": 15, "overtime_factor": 1.5}'::jsonb, 650, 20),

('CAL-WEEKEND', 'Weekend/helligdag', 'Weekend og helligdagstillæg.', 'special', false,
'{"indirect_time": 10, "personal_time": 5, "overhead": 12, "weekend_factor": 1.75}'::jsonb, 750, 18),

('CAL-NYBYG', 'Nybyggeri', 'Optimeret til nybyggeri med lavere spild og hurtigere arbejde.', 'project-type', false,
'{"indirect_time": 12, "personal_time": 6, "overhead": 10, "material_waste": 3}'::jsonb, 475, 12),

('CAL-RENOV', 'Renovering', 'Tilpasset renovering med højere spild og kompleksitet.', 'project-type', false,
'{"indirect_time": 18, "personal_time": 10, "overhead": 14, "material_waste": 8}'::jsonb, 520, 18),

('CAL-ERHVERV', 'Erhverv/industri', 'Erhvervsprojekter med højere kompleksitet.', 'project-type', false,
'{"indirect_time": 15, "personal_time": 8, "overhead": 15, "material_waste": 6}'::jsonb, 525, 16)

ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  factor_overrides = EXCLUDED.factor_overrides,
  hourly_rate = EXCLUDED.hourly_rate,
  margin_percentage = EXCLUDED.margin_percentage;

-- =====================================================
-- PART 5: ADD MISSING COMPONENTS REFERENCED BY QUICK JOBS
-- =====================================================

-- Add any missing component codes that quick jobs reference
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level, complexity_factor, default_cost_price, default_sale_price)
VALUES
  ('Fejlfinding el (pr. time)', 'FEJLFIND', (SELECT id FROM calc_component_categories WHERE slug = 'panels' LIMIT 1), 'Fejlfinding på el-installation, pris pr. time', 60, 3, 1.2, 0, 495),
  ('Ny gruppetavle 12 modul', 'TAVLE-NY', (SELECT id FROM calc_component_categories WHERE slug = 'panels' LIMIT 1), 'Installation af ny 12-modul gruppetavle', 120, 3, 1.3, 1200, 2800)
ON CONFLICT (code) DO NOTHING;

-- Add variants for new components
INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
SELECT c.id, v.name, v.code, v.time_multiplier, v.extra_minutes, v.is_default, v.sort_order
FROM calc_components c
CROSS JOIN (VALUES
  ('12 modul', '12MOD', 1.00, 0, true, 1),
  ('24 modul', '24MOD', 1.50, 30, false, 2),
  ('36 modul', '36MOD', 2.00, 60, false, 3)
) AS v(name, code, time_multiplier, extra_minutes, is_default, sort_order)
WHERE c.code = 'TAVLE-NY'
ON CONFLICT DO NOTHING;

-- =====================================================
-- PART 6: RLS POLICIES
-- =====================================================

ALTER TABLE quick_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE calibration_presets ENABLE ROW LEVEL SECURITY;

-- Quick jobs - readable by all authenticated users
CREATE POLICY "quick_jobs_select" ON quick_jobs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "quick_jobs_insert" ON quick_jobs
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "quick_jobs_update" ON quick_jobs
  FOR UPDATE TO authenticated USING (true);

-- Calibration presets - readable by all, editable by creator
CREATE POLICY "calibration_presets_select" ON calibration_presets
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "calibration_presets_insert" ON calibration_presets
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "calibration_presets_update" ON calibration_presets
  FOR UPDATE TO authenticated USING (true);

-- =====================================================
-- PART 7: GRANT PERMISSIONS
-- =====================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON quick_jobs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON calibration_presets TO authenticated;
