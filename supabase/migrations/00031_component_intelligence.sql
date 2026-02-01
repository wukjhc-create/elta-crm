-- =====================================================
-- Migration: 00031_component_intelligence.sql
-- Description: Phase C - Component Intelligence System
-- Date: 2026-02-01
-- =====================================================

-- =====================================================
-- PART 1: COMPONENT TIME PROFILES
-- =====================================================

-- Time profile enum for different scaling behaviors
DO $$ BEGIN
  CREATE TYPE component_time_profile AS ENUM (
    'linear',        -- Time scales linearly with quantity
    'diminishing',   -- First unit takes longer, subsequent faster
    'stepped',       -- Time increases in steps (e.g., every 5 units)
    'fixed',         -- Fixed time regardless of quantity
    'batch'          -- Optimal batch sizes with setup time
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- =====================================================
-- PART 2: ADD INTELLIGENCE FIELDS TO CALC_COMPONENTS
-- =====================================================

-- Time intelligence fields
ALTER TABLE calc_components
  ADD COLUMN IF NOT EXISTS first_unit_time_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS subsequent_unit_time_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS setup_time_minutes INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cleanup_time_minutes INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS time_profile TEXT DEFAULT 'linear';

-- Quantity intelligence
ALTER TABLE calc_components
  ADD COLUMN IF NOT EXISTS min_quantity INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_quantity INTEGER,
  ADD COLUMN IF NOT EXISTS optimal_batch_size INTEGER,
  ADD COLUMN IF NOT EXISTS quantity_step INTEGER DEFAULT 1;

-- Dependencies and rules
ALTER TABLE calc_components
  ADD COLUMN IF NOT EXISTS dependencies JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS incompatibilities JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS requires_components JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS suggested_with JSONB DEFAULT '[]';

-- Offer text fields
ALTER TABLE calc_components
  ADD COLUMN IF NOT EXISTS offer_description TEXT,
  ADD COLUMN IF NOT EXISTS offer_obs_points JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS installation_notes TEXT,
  ADD COLUMN IF NOT EXISTS certification_required TEXT[];

-- Pricing intelligence
ALTER TABLE calc_components
  ADD COLUMN IF NOT EXISTS price_includes_material BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS labor_only BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS volume_discount_threshold INTEGER,
  ADD COLUMN IF NOT EXISTS volume_discount_percent DECIMAL(5,2);

-- Comments for documentation
COMMENT ON COLUMN calc_components.first_unit_time_minutes IS 'Time for first unit (includes initial setup in work area)';
COMMENT ON COLUMN calc_components.subsequent_unit_time_minutes IS 'Time for each additional unit (faster due to setup done)';
COMMENT ON COLUMN calc_components.setup_time_minutes IS 'One-time setup time before starting work';
COMMENT ON COLUMN calc_components.cleanup_time_minutes IS 'One-time cleanup time after finishing';
COMMENT ON COLUMN calc_components.time_profile IS 'How time scales with quantity: linear, diminishing, stepped, fixed, batch';
COMMENT ON COLUMN calc_components.dependencies IS 'Component codes that must be present for this to work';
COMMENT ON COLUMN calc_components.incompatibilities IS 'Component codes that conflict with this one';
COMMENT ON COLUMN calc_components.requires_components IS 'Components automatically added when this is selected';
COMMENT ON COLUMN calc_components.suggested_with IS 'Components suggested when this is added';
COMMENT ON COLUMN calc_components.offer_description IS 'Professional description for offers/quotes';
COMMENT ON COLUMN calc_components.offer_obs_points IS 'Warning points and important notes for offers';

-- =====================================================
-- PART 3: ROOM TYPES TABLE
-- =====================================================

-- Drop existing room_types if it exists with wrong structure
DROP TABLE IF EXISTS room_templates CASCADE;
DROP TABLE IF EXISTS room_types CASCADE;

CREATE TABLE room_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,

  -- Room characteristics
  typical_size_m2 DECIMAL(6,2),
  min_size_m2 DECIMAL(6,2),
  max_size_m2 DECIMAL(6,2),

  -- Electrical requirements
  ip_rating_required TEXT DEFAULT 'IP20',
  typical_circuits INTEGER DEFAULT 1,
  requires_rcd BOOLEAN DEFAULT false,

  -- Standard component counts (base quantities)
  standard_components JSONB DEFAULT '{}',
  -- Structure: { "component_code": { "base_qty": 4, "per_m2": 0.5, "min": 2, "max": 12 } }

  -- Scaling rules
  size_scaling_factor DECIMAL(4,2) DEFAULT 1.0,

  -- Display
  icon TEXT DEFAULT 'Square',
  color TEXT DEFAULT 'gray',
  sort_order INTEGER DEFAULT 0,

  -- Status
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_room_types_active ON room_types(is_active) WHERE is_active = true;

CREATE TRIGGER update_room_types_updated_at
  BEFORE UPDATE ON room_types
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- PART 4: ROOM TEMPLATES TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS room_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_type_id UUID NOT NULL REFERENCES room_types(id) ON DELETE CASCADE,

  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,

  -- Template tier (basic, standard, premium)
  tier TEXT DEFAULT 'standard',

  -- Components for this template
  components JSONB NOT NULL DEFAULT '[]',
  -- Structure: [{ "component_code": "STIK-1-NY", "variant_code": "GIPS", "quantity": 4, "quantity_formula": "ceil(size_m2 / 4)", "notes": "..." }]

  -- Calculated estimates (updated on save)
  estimated_time_minutes INTEGER DEFAULT 0,
  estimated_cost_price DECIMAL(10,2) DEFAULT 0,
  estimated_sale_price DECIMAL(10,2) DEFAULT 0,

  -- Display
  is_featured BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,

  -- Status
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_room_templates_room_type ON room_templates(room_type_id);
CREATE INDEX idx_room_templates_tier ON room_templates(tier);
CREATE INDEX idx_room_templates_active ON room_templates(is_active) WHERE is_active = true;

CREATE TRIGGER update_room_templates_updated_at
  BEFORE UPDATE ON room_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- PART 5: GLOBAL MATERIALS CATALOG
-- =====================================================

CREATE TABLE IF NOT EXISTS materials_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identification
  sku TEXT UNIQUE,
  name TEXT NOT NULL,
  description TEXT,

  -- Categorization
  category TEXT NOT NULL DEFAULT 'general',
  subcategory TEXT,
  brand TEXT,

  -- Pricing
  cost_price DECIMAL(10,2) NOT NULL DEFAULT 0,
  sale_price DECIMAL(10,2) NOT NULL DEFAULT 0,
  currency TEXT DEFAULT 'DKK',

  -- Quantity
  unit TEXT NOT NULL DEFAULT 'stk',
  min_order_qty INTEGER DEFAULT 1,
  pack_size INTEGER DEFAULT 1,

  -- Supplier
  supplier_id UUID,
  supplier_sku TEXT,
  lead_time_days INTEGER,

  -- Stock tracking
  track_stock BOOLEAN DEFAULT false,
  stock_quantity INTEGER DEFAULT 0,
  reorder_level INTEGER,

  -- Metadata
  specifications JSONB DEFAULT '{}',
  images TEXT[],

  -- Status
  is_active BOOLEAN DEFAULT true,
  discontinued_at TIMESTAMPTZ,

  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_materials_catalog_category ON materials_catalog(category);
CREATE INDEX idx_materials_catalog_sku ON materials_catalog(sku) WHERE sku IS NOT NULL;
CREATE INDEX idx_materials_catalog_active ON materials_catalog(is_active) WHERE is_active = true;
CREATE INDEX idx_materials_catalog_name ON materials_catalog USING gin(to_tsvector('danish', name));

CREATE TRIGGER update_materials_catalog_updated_at
  BEFORE UPDATE ON materials_catalog
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- PART 6: PRICE HISTORY TRACKING
-- =====================================================

CREATE TABLE IF NOT EXISTS material_price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID NOT NULL REFERENCES materials_catalog(id) ON DELETE CASCADE,

  cost_price DECIMAL(10,2) NOT NULL,
  sale_price DECIMAL(10,2) NOT NULL,

  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_to TIMESTAMPTZ,

  change_reason TEXT,
  changed_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_material_price_history_material ON material_price_history(material_id);
CREATE INDEX idx_material_price_history_effective ON material_price_history(effective_from, effective_to);

-- =====================================================
-- PART 7: OFFER TEXT TEMPLATES
-- =====================================================

CREATE TABLE IF NOT EXISTS offer_text_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Scope
  scope_type TEXT NOT NULL DEFAULT 'component',
  -- 'component', 'category', 'room_type', 'global'
  scope_id UUID, -- Reference to component, category, or room_type

  -- Template content
  template_key TEXT NOT NULL,
  -- 'description', 'obs_point', 'installation_note', 'warranty', 'terms'

  title TEXT,
  content TEXT NOT NULL,

  -- Conditions for when to use
  conditions JSONB DEFAULT '{}',
  -- Structure: { "min_quantity": 5, "variant_codes": ["BETON"], "building_profiles": ["HOUSE"] }

  -- Display
  priority INTEGER DEFAULT 0,
  is_required BOOLEAN DEFAULT false,

  -- Status
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_offer_text_templates_scope ON offer_text_templates(scope_type, scope_id);
CREATE INDEX idx_offer_text_templates_key ON offer_text_templates(template_key);
CREATE INDEX idx_offer_text_templates_active ON offer_text_templates(is_active) WHERE is_active = true;

CREATE TRIGGER update_offer_text_templates_updated_at
  BEFORE UPDATE ON offer_text_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- PART 8: SEED ROOM TYPES
-- =====================================================

INSERT INTO room_types (code, name, description, typical_size_m2, min_size_m2, max_size_m2, ip_rating_required, typical_circuits, requires_rcd, icon, color, sort_order, standard_components) VALUES

('BEDROOM', 'Soveværelse', 'Standard soveværelse med belysning og stikkontakter', 14, 8, 25, 'IP20', 1, false, 'Bed', 'indigo', 1,
'{"STIK-1-NY": {"base_qty": 4, "per_m2": 0.2, "min": 3, "max": 8}, "AFB-1P-NY": {"base_qty": 1, "per_m2": 0, "min": 1, "max": 2}, "LOFT-NY": {"base_qty": 1, "per_m2": 0, "min": 1, "max": 1}}'::jsonb),

('LIVING', 'Stue', 'Opholdsstue med flere stikkontakter og belysningspunkter', 25, 15, 50, 'IP20', 2, false, 'Sofa', 'amber', 2,
'{"STIK-1-NY": {"base_qty": 6, "per_m2": 0.25, "min": 4, "max": 12}, "STIK-DBL-NY": {"base_qty": 2, "per_m2": 0.1, "min": 1, "max": 4}, "AFB-1P-NY": {"base_qty": 2, "per_m2": 0, "min": 1, "max": 3}, "LOFT-NY": {"base_qty": 1, "per_m2": 0, "min": 1, "max": 2}, "SPOT-LED-NY": {"base_qty": 0, "per_m2": 0.3, "min": 0, "max": 12}}'::jsonb),

('KITCHEN', 'Køkken', 'Køkken med hårde hvidevarer og arbejdsbelysning', 12, 6, 30, 'IP20', 3, true, 'ChefHat', 'orange', 3,
'{"STIK-DBL-NY": {"base_qty": 4, "per_m2": 0.3, "min": 3, "max": 8}, "STIK-1-NY": {"base_qty": 4, "per_m2": 0.2, "min": 2, "max": 6}, "AFB-1P-NY": {"base_qty": 2, "per_m2": 0, "min": 1, "max": 3}, "SPOT-LED-NY": {"base_qty": 4, "per_m2": 0.4, "min": 3, "max": 12}, "LOFT-NY": {"base_qty": 1, "per_m2": 0, "min": 1, "max": 1}}'::jsonb),

('BATHROOM', 'Badeværelse', 'Badeværelse med IP44 krav og RCD beskyttelse', 6, 3, 15, 'IP44', 1, true, 'Bath', 'cyan', 4,
'{"STIK-IP44-NY": {"base_qty": 1, "per_m2": 0.15, "min": 1, "max": 3}, "SPOT-LED-NY": {"base_qty": 4, "per_m2": 0.5, "min": 2, "max": 8}, "AFB-1P-NY": {"base_qty": 1, "per_m2": 0, "min": 1, "max": 2}, "LOFT-NY": {"base_qty": 1, "per_m2": 0, "min": 1, "max": 1}}'::jsonb),

('HALLWAY', 'Gang/Entre', 'Gang eller entré med korrespondanceafbrydere', 8, 3, 20, 'IP20', 1, false, 'DoorOpen', 'slate', 5,
'{"STIK-1-NY": {"base_qty": 2, "per_m2": 0.15, "min": 1, "max": 4}, "AFB-KORR-NY": {"base_qty": 2, "per_m2": 0.1, "min": 2, "max": 4}, "LOFT-NY": {"base_qty": 1, "per_m2": 0.1, "min": 1, "max": 3}, "SPOT-LED-NY": {"base_qty": 0, "per_m2": 0.3, "min": 0, "max": 6}}'::jsonb),

('OFFICE', 'Kontor/Arbejdsværelse', 'Hjemmekontor med ekstra stikkontakter og data', 12, 8, 25, 'IP20', 2, false, 'Monitor', 'blue', 6,
'{"STIK-DBL-NY": {"base_qty": 3, "per_m2": 0.2, "min": 2, "max": 6}, "STIK-USB-NY": {"base_qty": 2, "per_m2": 0.1, "min": 1, "max": 4}, "AFB-1P-NY": {"base_qty": 1, "per_m2": 0, "min": 1, "max": 2}, "LOFT-NY": {"base_qty": 1, "per_m2": 0, "min": 1, "max": 1}, "SPOT-LED-NY": {"base_qty": 2, "per_m2": 0.2, "min": 0, "max": 6}}'::jsonb),

('UTILITY', 'Bryggers/Teknik', 'Bryggers eller teknikrum med hvidevarer', 8, 4, 15, 'IP20', 2, true, 'WashingMachine', 'gray', 7,
'{"STIK-1-NY": {"base_qty": 4, "per_m2": 0.3, "min": 3, "max": 8}, "AFB-1P-NY": {"base_qty": 1, "per_m2": 0, "min": 1, "max": 2}, "LOFT-NY": {"base_qty": 1, "per_m2": 0, "min": 1, "max": 2}}'::jsonb),

('GARAGE', 'Garage', 'Garage med IP-klassede installationer', 25, 15, 60, 'IP44', 2, true, 'Car', 'zinc', 8,
'{"STIK-IP54-NY": {"base_qty": 2, "per_m2": 0.1, "min": 2, "max": 6}, "LOFT-IP44-NY": {"base_qty": 2, "per_m2": 0.1, "min": 1, "max": 4}, "AFB-1P-NY": {"base_qty": 1, "per_m2": 0, "min": 1, "max": 2}}'::jsonb),

('BASEMENT', 'Kælder', 'Kælderrum med grundlæggende installation', 20, 10, 100, 'IP44', 1, true, 'Warehouse', 'stone', 9,
'{"STIK-IP44-NY": {"base_qty": 2, "per_m2": 0.1, "min": 1, "max": 6}, "LOFT-IP44-NY": {"base_qty": 1, "per_m2": 0.05, "min": 1, "max": 4}, "AFB-1P-NY": {"base_qty": 1, "per_m2": 0, "min": 1, "max": 2}}'::jsonb),

('OUTDOOR', 'Udendørs', 'Udendørs områder med vejrbestandige installationer', 50, 10, 500, 'IP65', 1, true, 'Sun', 'green', 10,
'{"STIK-IP54-NY": {"base_qty": 2, "per_m2": 0.02, "min": 1, "max": 6}, "LOFT-IP44-NY": {"base_qty": 1, "per_m2": 0.02, "min": 1, "max": 4}}'::jsonb)

ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  typical_size_m2 = EXCLUDED.typical_size_m2,
  min_size_m2 = EXCLUDED.min_size_m2,
  max_size_m2 = EXCLUDED.max_size_m2,
  ip_rating_required = EXCLUDED.ip_rating_required,
  typical_circuits = EXCLUDED.typical_circuits,
  requires_rcd = EXCLUDED.requires_rcd,
  icon = EXCLUDED.icon,
  color = EXCLUDED.color,
  sort_order = EXCLUDED.sort_order,
  standard_components = EXCLUDED.standard_components;

-- =====================================================
-- PART 9: UPDATE EXISTING COMPONENTS WITH INTELLIGENCE
-- =====================================================

-- Stikkontakter - first unit takes longer (setup), subsequent faster
UPDATE calc_components SET
  first_unit_time_minutes = 18,
  subsequent_unit_time_minutes = 12,
  setup_time_minutes = 10,
  time_profile = 'diminishing',
  min_quantity = 1,
  offer_description = 'Ny stikkontakt inkl. ledningsføring og tilslutning. Materiale og arbejdsløn inkluderet.',
  offer_obs_points = '["Eksisterende tapeter/maling kan blive beskadiget ved hulboring", "Placering aftales på stedet"]'::jsonb
WHERE code LIKE 'STIK-%' AND code LIKE '%-NY';

-- Spots - optimal in batches of 4-6
UPDATE calc_components SET
  first_unit_time_minutes = 20,
  subsequent_unit_time_minutes = 10,
  setup_time_minutes = 15,
  time_profile = 'diminishing',
  min_quantity = 2,
  optimal_batch_size = 4,
  offer_description = 'LED spot inkl. driver og installation. Energieffektiv belysning med lang levetid.',
  offer_obs_points = '["Loftshøjde minimum 2,4m anbefales", "Isolering i loft kan kræve særlige spots"]'::jsonb
WHERE code LIKE 'SPOT-%';

-- Afbrydere
UPDATE calc_components SET
  first_unit_time_minutes = 15,
  subsequent_unit_time_minutes = 10,
  time_profile = 'diminishing',
  offer_description = 'Ny afbryder inkl. tilslutning til eksisterende eller ny ledning.',
  offer_obs_points = '["Afbryderplacering aftales inden arbejdet påbegyndes"]'::jsonb
WHERE code LIKE 'AFB-%' AND code LIKE '%-NY';

-- Korrespondanceafbrydere requires at least 2
UPDATE calc_components SET
  min_quantity = 2,
  requires_components = '["KABEL-M"]'::jsonb,
  offer_description = 'Korrespondanceafbrydere til betjening af lys fra flere steder. Minimum 2 stk. påkrævet.',
  offer_obs_points = '["Kræver ekstra ledningsføring mellem afbrydere", "Kan kræve trækning af nye kabler"]'::jsonb
WHERE code LIKE 'AFB-KORR%';

-- EV-lader har dependencies
UPDATE calc_components SET
  requires_components = '["GRP-NY"]'::jsonb,
  suggested_with = '["KABEL-M"]'::jsonb,
  offer_description = 'Installation af elbil-lader inkl. opsætning og konfiguration. Dedikeret gruppe i tavle påkrævet.',
  offer_obs_points = '["Kræver minimum 3x25A gruppe i tavle", "Afstand fra tavle til lader påvirker kabelpris", "Netselskab skal muligvis kontaktes ved høj effekt"]'::jsonb,
  certification_required = ARRAY['Autoriseret elinstallatør']
WHERE code = 'EV-LADER';

-- Gruppearbejde
UPDATE calc_components SET
  first_unit_time_minutes = 30,
  subsequent_unit_time_minutes = 20,
  setup_time_minutes = 15,
  time_profile = 'diminishing',
  offer_description = 'Ny gruppe i eksisterende tavle inkl. automatsikring og HPFI hvis påkrævet.',
  offer_obs_points = '["Kræver plads i eksisterende tavle", "Ved pladsmangel kan tavleudvidelse være nødvendig"]'::jsonb
WHERE code = 'GRP-NY';

-- Hårde hvidevarer har fixed time
UPDATE calc_components SET
  time_profile = 'fixed',
  offer_description = 'Tilslutning af hård hvidevare. El-tilslutning og funktionstest inkluderet.',
  offer_obs_points = '["Kunden skal selv sørge for levering af hvidevare", "Eksisterende tilslutning forudsættes"]'::jsonb
WHERE code LIKE 'HV-%';

-- =====================================================
-- PART 10: SEED OFFER TEXT TEMPLATES
-- =====================================================

INSERT INTO offer_text_templates (scope_type, template_key, title, content, conditions, priority, is_required) VALUES

-- Global templates
('global', 'warranty', 'Garanti', 'Alt arbejde udføres af autoriseret elinstallatør og leveres med 5 års garanti på udført arbejde. Producentgaranti på materialer følger producentens vilkår.', '{}', 100, true),

('global', 'terms', 'Forbehold', 'Tilbuddet er baseret på besigtigelse/beskrivelse og gælder 30 dage. Skjulte forhold eller ændrede ønsker kan medføre merpris. Priser er ekskl. moms medmindre andet er angivet.', '{}', 99, true),

('global', 'obs_hidden', 'Skjulte installationer', 'Ved arbejde i eksisterende bygninger kan der forekomme skjulte forhold der kræver ekstra arbejde. Dette afregnes efter medgået tid.', '{}', 80, false),

-- Category-specific
('category', 'obs_bathroom', 'Badeværelse zoneinddeling', 'Alt el-arbejde i badeværelse udføres iht. Stærkstrømsbekendtgørelsens krav om zoneinddeling. Installationer i zone 0-2 udføres med korrekt IP-klassificering.', '{"room_types": ["BATHROOM"]}', 90, false),

('category', 'obs_outdoor', 'Udendørs installationer', 'Udendørs installationer udføres med IP65 eller bedre klassificering. Jordforbindelse sikres iht. gældende regler.', '{"room_types": ["OUTDOOR", "GARAGE"]}', 85, false),

('category', 'obs_ev_charger', 'Elbil-lader krav', 'Installation af elbil-lader kræver minimum 3-faset tilslutning og dedikeret gruppe. Ved høj effekt (over 11kW) skal netselskab kontaktes for godkendelse.', '{"component_codes": ["EV-LADER"]}', 95, true)

ON CONFLICT DO NOTHING;

-- =====================================================
-- PART 11: SEED MATERIALS CATALOG
-- =====================================================

INSERT INTO materials_catalog (sku, name, description, category, subcategory, brand, cost_price, sale_price, unit) VALUES

-- Kabler
('KAB-3G15', '3G1,5 installationskabel', 'PVL 3G1,5mm² installationskabel, hvid', 'cables', 'installation', 'Danaher', 3.50, 7.00, 'm'),
('KAB-3G25', '3G2,5 installationskabel', 'PVL 3G2,5mm² installationskabel, hvid', 'cables', 'installation', 'Danaher', 5.50, 11.00, 'm'),
('KAB-5G25', '5G2,5 installationskabel', 'PVL 5G2,5mm² installationskabel, grå', 'cables', 'installation', 'Danaher', 12.00, 24.00, 'm'),
('KAB-5G6', '5G6 kraftkabel', 'NOIK-AL 5G6mm² kraftkabel til EV-lader', 'cables', 'power', 'Nexans', 45.00, 90.00, 'm'),

-- Stikkontakter
('MAT-STIK-1', 'Enkelt stikkontakt', 'LK FUGA stikkontakt 1-polet med jord', 'outlets', 'standard', 'LK', 45.00, 95.00, 'stk'),
('MAT-STIK-2', 'Dobbelt stikkontakt', 'LK FUGA dobbelt stikkontakt med jord', 'outlets', 'standard', 'LK', 75.00, 155.00, 'stk'),
('MAT-STIK-USB', 'USB stikkontakt', 'LK FUGA stikkontakt med 2x USB-A', 'outlets', 'smart', 'LK', 185.00, 350.00, 'stk'),
('MAT-STIK-IP44', 'IP44 stikkontakt', 'LK stikkontakt IP44 til vådrum', 'outlets', 'ip_rated', 'LK', 125.00, 250.00, 'stk'),

-- Afbrydere
('MAT-AFB-1P', 'Afbryder 1-pol', 'LK FUGA afbryder 1-polet', 'switches', 'standard', 'LK', 55.00, 115.00, 'stk'),
('MAT-AFB-2P', 'Afbryder 2-pol', 'LK FUGA afbryder 2-polet korrespondance', 'switches', 'standard', 'LK', 85.00, 175.00, 'stk'),
('MAT-AFB-DIM', 'Lysdæmper LED', 'LK FUGA LED lysdæmper 0-300W', 'switches', 'dimmer', 'LK', 350.00, 650.00, 'stk'),

-- Spots
('MAT-SPOT-LED', 'LED spot 5W', 'Nordtronic LED indbygningsspot 5W 2700K', 'lighting', 'spots', 'Nordtronic', 85.00, 175.00, 'stk'),
('MAT-SPOT-DRV', 'Spot driver', 'LED driver til 1-6 spots', 'lighting', 'drivers', 'Mean Well', 150.00, 295.00, 'stk'),

-- Tavle komponenter
('MAT-AUT-B10', 'Automatsikring B10', 'ABB automatsikring B10 1-polet', 'panel', 'breakers', 'ABB', 45.00, 95.00, 'stk'),
('MAT-AUT-B16', 'Automatsikring B16', 'ABB automatsikring B16 1-polet', 'panel', 'breakers', 'ABB', 45.00, 95.00, 'stk'),
('MAT-HPFI-40', 'HPFI 40A', 'ABB HPFI relæ 40A 30mA 4-polet', 'panel', 'rcd', 'ABB', 450.00, 850.00, 'stk'),

-- Dåser og tilbehør
('MAT-DAASE-1', 'Indmuringsdåse enkel', 'LK indmuringsdåse Ø68mm', 'accessories', 'boxes', 'LK', 8.00, 18.00, 'stk'),
('MAT-DAASE-2', 'Indmuringsdåse dobbelt', 'LK indmuringsdåse 2-gang Ø68mm', 'accessories', 'boxes', 'LK', 15.00, 32.00, 'stk'),
('MAT-AFDAEK', 'Afdækningsramme', 'LK FUGA afdækningsramme 1M hvid', 'accessories', 'covers', 'LK', 25.00, 55.00, 'stk')

ON CONFLICT (sku) DO UPDATE SET
  name = EXCLUDED.name,
  cost_price = EXCLUDED.cost_price,
  sale_price = EXCLUDED.sale_price;

-- =====================================================
-- PART 12: RLS POLICIES
-- =====================================================

ALTER TABLE room_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE materials_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE offer_text_templates ENABLE ROW LEVEL SECURITY;

-- Room types - read by all authenticated
CREATE POLICY "room_types_select" ON room_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "room_types_modify" ON room_types FOR ALL TO authenticated USING (true);

-- Room templates
CREATE POLICY "room_templates_select" ON room_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "room_templates_modify" ON room_templates FOR ALL TO authenticated USING (true);

-- Materials catalog
CREATE POLICY "materials_catalog_select" ON materials_catalog FOR SELECT TO authenticated USING (true);
CREATE POLICY "materials_catalog_modify" ON materials_catalog FOR ALL TO authenticated USING (true);

-- Price history
CREATE POLICY "material_price_history_select" ON material_price_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "material_price_history_insert" ON material_price_history FOR INSERT TO authenticated WITH CHECK (true);

-- Offer text templates
CREATE POLICY "offer_text_templates_select" ON offer_text_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "offer_text_templates_modify" ON offer_text_templates FOR ALL TO authenticated USING (true);

-- =====================================================
-- PART 13: GRANT PERMISSIONS
-- =====================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON room_types TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON room_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON materials_catalog TO authenticated;
GRANT SELECT, INSERT ON material_price_history TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON offer_text_templates TO authenticated;

-- =====================================================
-- PART 14: CREATE HELPER FUNCTIONS
-- =====================================================

-- Function to calculate time with intelligence
CREATE OR REPLACE FUNCTION calculate_component_time(
  p_component_id UUID,
  p_quantity INTEGER,
  p_variant_multiplier DECIMAL DEFAULT 1.0
) RETURNS INTEGER AS $$
DECLARE
  v_component calc_components%ROWTYPE;
  v_base_time INTEGER;
  v_first_time INTEGER;
  v_subsequent_time INTEGER;
  v_setup_time INTEGER;
  v_total_time INTEGER;
BEGIN
  SELECT * INTO v_component FROM calc_components WHERE id = p_component_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Get time values (use intelligent values if set, otherwise base_time)
  v_first_time := COALESCE(v_component.first_unit_time_minutes, v_component.base_time_minutes);
  v_subsequent_time := COALESCE(v_component.subsequent_unit_time_minutes, v_component.base_time_minutes);
  v_setup_time := COALESCE(v_component.setup_time_minutes, 0);

  -- Calculate based on time profile
  CASE v_component.time_profile
    WHEN 'fixed' THEN
      v_total_time := v_first_time;
    WHEN 'diminishing' THEN
      -- First unit + subsequent units at reduced time
      IF p_quantity = 1 THEN
        v_total_time := v_first_time;
      ELSE
        v_total_time := v_first_time + (p_quantity - 1) * v_subsequent_time;
      END IF;
    WHEN 'batch' THEN
      -- Setup time + batch calculation
      v_total_time := v_setup_time + (p_quantity * v_subsequent_time);
    ELSE -- 'linear' is default
      v_total_time := p_quantity * v_component.base_time_minutes;
  END CASE;

  -- Apply variant multiplier
  v_total_time := ROUND(v_total_time * p_variant_multiplier);

  -- Add setup and cleanup for non-fixed profiles
  IF v_component.time_profile != 'fixed' THEN
    v_total_time := v_total_time + v_setup_time + COALESCE(v_component.cleanup_time_minutes, 0);
  END IF;

  RETURN v_total_time;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to get room component suggestions
CREATE OR REPLACE FUNCTION get_room_component_suggestions(
  p_room_type_code TEXT,
  p_size_m2 DECIMAL
) RETURNS TABLE (
  component_code TEXT,
  suggested_quantity INTEGER,
  min_quantity INTEGER,
  max_quantity INTEGER
) AS $$
DECLARE
  v_room room_types%ROWTYPE;
  v_comp_config JSONB;
  v_code TEXT;
  v_base_qty INTEGER;
  v_per_m2 DECIMAL;
  v_min INTEGER;
  v_max INTEGER;
  v_calculated INTEGER;
BEGIN
  SELECT * INTO v_room FROM room_types WHERE code = p_room_type_code;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  FOR v_code, v_comp_config IN SELECT * FROM jsonb_each(v_room.standard_components)
  LOOP
    v_base_qty := COALESCE((v_comp_config->>'base_qty')::INTEGER, 0);
    v_per_m2 := COALESCE((v_comp_config->>'per_m2')::DECIMAL, 0);
    v_min := COALESCE((v_comp_config->>'min')::INTEGER, 1);
    v_max := COALESCE((v_comp_config->>'max')::INTEGER, 100);

    -- Calculate suggested quantity
    v_calculated := v_base_qty + CEIL(p_size_m2 * v_per_m2)::INTEGER;
    v_calculated := GREATEST(v_min, LEAST(v_max, v_calculated));

    component_code := v_code;
    suggested_quantity := v_calculated;
    min_quantity := v_min;
    max_quantity := v_max;

    RETURN NEXT;
  END LOOP;
END;
$$ LANGUAGE plpgsql STABLE;
