-- =====================================================
-- 00018_calculation_settings.sql
-- Calculation Settings, Project Templates & Enhanced Calculations
-- =====================================================

-- =====================================================
-- 1. CALCULATION SETTINGS TABLE
-- =====================================================

CREATE TABLE calculation_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT NOT NULL UNIQUE,
  setting_value JSONB NOT NULL DEFAULT '{}',
  category TEXT NOT NULL, -- 'hourly_rates', 'margins', 'work_hours', 'defaults', 'labor_types'
  description TEXT,
  updated_by UUID REFERENCES profiles(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX idx_calculation_settings_category ON calculation_settings(category);
CREATE INDEX idx_calculation_settings_key ON calculation_settings(setting_key);

-- Trigger for updated_at
CREATE TRIGGER update_calculation_settings_updated_at
  BEFORE UPDATE ON calculation_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Insert default settings
INSERT INTO calculation_settings (setting_key, setting_value, category, description) VALUES
  -- Timepriser
  ('hourly_rate_electrician', '{"rate": 495, "label": "Elektriker"}', 'hourly_rates', 'Timepris for elektriker'),
  ('hourly_rate_apprentice', '{"rate": 295, "label": "Lærling"}', 'hourly_rates', 'Timepris for lærling'),
  ('hourly_rate_master', '{"rate": 650, "label": "El-installatør"}', 'hourly_rates', 'Timepris for el-installatør'),
  ('hourly_rate_helper', '{"rate": 350, "label": "Hjælper"}', 'hourly_rates', 'Timepris for hjælper'),

  -- Avancer
  ('margin_materials', '{"percentage": 25, "label": "Materialer"}', 'margins', 'Avance på materialer'),
  ('margin_products', '{"percentage": 20, "label": "Produkter"}', 'margins', 'Avance på produkter'),
  ('margin_subcontractor', '{"percentage": 10, "label": "Underentreprise"}', 'margins', 'Avance på underentreprise'),
  ('default_db_target', '{"percentage": 35, "label": "Mål-DB"}', 'margins', 'Standard dækningsbidrag mål'),
  ('minimum_db', '{"percentage": 20, "label": "Minimum DB"}', 'margins', 'Minimum acceptabelt DB'),

  -- Arbejdstider
  ('work_hours_standard', '{"start": "07:00", "end": "15:30", "break_minutes": 30, "label": "Normal arbejdstid"}', 'work_hours', 'Standard arbejdstid'),
  ('work_hours_overtime', '{"multiplier": 1.5, "label": "Overtid"}', 'work_hours', 'Overtidstillæg'),
  ('work_hours_weekend', '{"multiplier": 2.0, "label": "Weekend"}', 'work_hours', 'Weekendtillæg'),

  -- Standarder
  ('default_vat', '{"percentage": 25}', 'defaults', 'Moms'),
  ('default_currency', '{"code": "DKK", "symbol": "kr"}', 'defaults', 'Valuta'),
  ('default_validity_days', '{"days": 30}', 'defaults', 'Tilbuds gyldighed i dage'),
  ('default_payment_terms', '{"days": 14, "label": "Netto 14 dage"}', 'defaults', 'Betalingsbetingelser'),

  -- Arbejdstyper (for kalkulation)
  ('labor_types', '{
    "types": [
      {"code": "ELECTRICIAN", "label": "Elektriker", "rate_key": "hourly_rate_electrician"},
      {"code": "APPRENTICE", "label": "Lærling", "rate_key": "hourly_rate_apprentice"},
      {"code": "MASTER", "label": "El-installatør", "rate_key": "hourly_rate_master"},
      {"code": "HELPER", "label": "Hjælper", "rate_key": "hourly_rate_helper"}
    ]
  }', 'labor_types', 'Tilgængelige arbejdstyper');

-- =====================================================
-- 2. PROJECT TEMPLATES TABLE
-- =====================================================

CREATE TABLE project_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT UNIQUE,
  description TEXT,
  project_type TEXT NOT NULL DEFAULT 'residential', -- 'residential', 'commercial', 'industrial', 'solar'

  -- Default configuration
  default_rooms JSONB DEFAULT '[]',
  -- Example: [{"room_type": "living_room", "count": 1}, {"room_type": "bedroom", "count": 3}]

  settings_overrides JSONB DEFAULT '{}',
  -- Override default settings for this template

  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX idx_project_templates_code ON project_templates(code);
CREATE INDEX idx_project_templates_project_type ON project_templates(project_type);
CREATE INDEX idx_project_templates_is_active ON project_templates(is_active);

-- Trigger
CREATE TRIGGER update_project_templates_updated_at
  BEFORE UPDATE ON project_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 3. ROOM TYPES TABLE
-- =====================================================

CREATE TABLE room_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  description TEXT,
  icon TEXT, -- Icon name for UI

  -- Default components for this room type
  default_components JSONB DEFAULT '[]',
  -- Example: [{"component_code": "STIK-STD", "quantity": 4, "variant": "GIPS"}]

  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX idx_room_types_code ON room_types(code);
CREATE INDEX idx_room_types_is_active ON room_types(is_active);

-- Insert default room types with typical components
INSERT INTO room_types (name, code, icon, sort_order, default_components) VALUES
  ('Stue', 'living_room', 'sofa', 1, '[
    {"component_code": "STIK-STD", "quantity": 6, "variant": "GIPS"},
    {"component_code": "LOFT-STD", "quantity": 2, "variant": "GIPS"},
    {"component_code": "SPOT-STD", "quantity": 4, "variant": "GIPS"}
  ]'),
  ('Køkken', 'kitchen', 'cooking-pot', 2, '[
    {"component_code": "STIK-STD", "quantity": 8, "variant": "GIPS"},
    {"component_code": "LOFT-STD", "quantity": 2, "variant": "GIPS"},
    {"component_code": "SPOT-STD", "quantity": 6, "variant": "GIPS"},
    {"component_code": "STIK-UD", "quantity": 1, "variant": "MUR"}
  ]'),
  ('Soveværelse', 'bedroom', 'bed', 3, '[
    {"component_code": "STIK-STD", "quantity": 4, "variant": "GIPS"},
    {"component_code": "LOFT-STD", "quantity": 1, "variant": "GIPS"}
  ]'),
  ('Badeværelse', 'bathroom', 'bath', 4, '[
    {"component_code": "STIK-STD", "quantity": 2, "variant": "FLISE"},
    {"component_code": "LOFT-STD", "quantity": 1, "variant": "GIPS"},
    {"component_code": "SPOT-STD", "quantity": 3, "variant": "GIPS"}
  ]'),
  ('Entre/Gang', 'hallway', 'door-open', 5, '[
    {"component_code": "STIK-STD", "quantity": 2, "variant": "GIPS"},
    {"component_code": "LOFT-STD", "quantity": 1, "variant": "GIPS"},
    {"component_code": "SPOT-STD", "quantity": 2, "variant": "GIPS"}
  ]'),
  ('Kontor', 'office', 'briefcase', 6, '[
    {"component_code": "STIK-STD", "quantity": 6, "variant": "GIPS"},
    {"component_code": "LOFT-STD", "quantity": 1, "variant": "GIPS"},
    {"component_code": "SPOT-STD", "quantity": 4, "variant": "GIPS"}
  ]'),
  ('Bryggers', 'utility', 'washing-machine', 7, '[
    {"component_code": "STIK-STD", "quantity": 4, "variant": "GIPS"},
    {"component_code": "LOFT-STD", "quantity": 1, "variant": "GIPS"}
  ]'),
  ('Garage', 'garage', 'car', 8, '[
    {"component_code": "STIK-STD", "quantity": 4, "variant": "BETON"},
    {"component_code": "LOFT-STD", "quantity": 2, "variant": "BETON"},
    {"component_code": "STIK-UD", "quantity": 1, "variant": "MUR"}
  ]'),
  ('Kælder', 'basement', 'stairs', 9, '[
    {"component_code": "STIK-STD", "quantity": 4, "variant": "BETON"},
    {"component_code": "LOFT-STD", "quantity": 2, "variant": "BETON"}
  ]'),
  ('Loft/Tagrum', 'attic', 'home', 10, '[
    {"component_code": "STIK-STD", "quantity": 2, "variant": "TRAE"},
    {"component_code": "LOFT-STD", "quantity": 1, "variant": "TRAE"}
  ]');

-- Insert default project templates
INSERT INTO project_templates (name, code, description, project_type, sort_order, default_rooms) VALUES
  ('Standard parcelhus', 'STANDARD_HOUSE', 'Typisk dansk parcelhus med 4-5 værelser', 'residential', 1, '[
    {"room_type": "living_room", "count": 1, "name": "Stue"},
    {"room_type": "kitchen", "count": 1, "name": "Køkken"},
    {"room_type": "bedroom", "count": 3, "name": "Soveværelse"},
    {"room_type": "bathroom", "count": 2, "name": "Badeværelse"},
    {"room_type": "hallway", "count": 1, "name": "Entre"},
    {"room_type": "utility", "count": 1, "name": "Bryggers"},
    {"room_type": "garage", "count": 1, "name": "Garage"}
  ]'),
  ('Lejlighed', 'APARTMENT', 'Standard lejlighed 2-3 værelser', 'residential', 2, '[
    {"room_type": "living_room", "count": 1, "name": "Stue"},
    {"room_type": "kitchen", "count": 1, "name": "Køkken"},
    {"room_type": "bedroom", "count": 2, "name": "Soveværelse"},
    {"room_type": "bathroom", "count": 1, "name": "Badeværelse"},
    {"room_type": "hallway", "count": 1, "name": "Entre"}
  ]'),
  ('Rækkehus', 'TOWNHOUSE', 'Typisk rækkehus over 2 etager', 'residential', 3, '[
    {"room_type": "living_room", "count": 1, "name": "Stue"},
    {"room_type": "kitchen", "count": 1, "name": "Køkken"},
    {"room_type": "bedroom", "count": 3, "name": "Soveværelse"},
    {"room_type": "bathroom", "count": 2, "name": "Badeværelse"},
    {"room_type": "hallway", "count": 2, "name": "Gang"},
    {"room_type": "utility", "count": 1, "name": "Bryggers"}
  ]'),
  ('Sommerhus', 'COTTAGE', 'Mindre sommerhus', 'residential', 4, '[
    {"room_type": "living_room", "count": 1, "name": "Stue/køkken"},
    {"room_type": "bedroom", "count": 2, "name": "Soveværelse"},
    {"room_type": "bathroom", "count": 1, "name": "Badeværelse"}
  ]'),
  ('Tilbygning', 'EXTENSION', 'Tilbygning til eksisterende hus', 'residential', 5, '[
    {"room_type": "living_room", "count": 1, "name": "Nyt rum"}
  ]'),
  ('Renovering komplet', 'RENOVATION_FULL', 'Komplet el-renovering', 'residential', 6, '[
    {"room_type": "living_room", "count": 1, "name": "Stue"},
    {"room_type": "kitchen", "count": 1, "name": "Køkken"},
    {"room_type": "bedroom", "count": 2, "name": "Soveværelse"},
    {"room_type": "bathroom", "count": 1, "name": "Badeværelse"},
    {"room_type": "hallway", "count": 1, "name": "Entre"}
  ]');

-- =====================================================
-- 4. ENHANCE CALCULATIONS TABLE
-- =====================================================

ALTER TABLE calculations
  ADD COLUMN IF NOT EXISTS calculation_mode TEXT DEFAULT 'detailed', -- 'quick', 'detailed', 'template'
  ADD COLUMN IF NOT EXISTS project_type TEXT DEFAULT 'custom', -- 'residential', 'commercial', 'solar', 'custom'
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES project_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS room_data JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS settings_snapshot JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS total_time_minutes INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_materials_cost DECIMAL(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_labor_cost DECIMAL(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_cost_price DECIMAL(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_sale_price DECIMAL(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS db_amount DECIMAL(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS db_percentage DECIMAL(5, 2) DEFAULT 0;

-- Indexes for new columns
CREATE INDEX IF NOT EXISTS idx_calculations_calculation_mode ON calculations(calculation_mode);
CREATE INDEX IF NOT EXISTS idx_calculations_project_type ON calculations(project_type);
CREATE INDEX IF NOT EXISTS idx_calculations_template_id ON calculations(template_id);

-- =====================================================
-- 5. ENHANCE CALCULATION ROWS TABLE
-- =====================================================

ALTER TABLE calculation_rows
  ADD COLUMN IF NOT EXISTS component_id UUID REFERENCES calc_components(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS component_variant_code TEXT,
  ADD COLUMN IF NOT EXISTS time_minutes INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_from_package BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS package_id UUID REFERENCES packages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS room_name TEXT,
  ADD COLUMN IF NOT EXISTS labor_type TEXT DEFAULT 'ELECTRICIAN';

-- Indexes for new columns
CREATE INDEX IF NOT EXISTS idx_calculation_rows_component_id ON calculation_rows(component_id);
CREATE INDEX IF NOT EXISTS idx_calculation_rows_package_id ON calculation_rows(package_id);
CREATE INDEX IF NOT EXISTS idx_calculation_rows_room_name ON calculation_rows(room_name);

-- =====================================================
-- 6. ENHANCE CALC_COMPONENTS TABLE
-- =====================================================

ALTER TABLE calc_components
  ADD COLUMN IF NOT EXISTS default_cost_price DECIMAL(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS default_sale_price DECIMAL(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS complexity_factor DECIMAL(3, 2) DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS labor_type TEXT DEFAULT 'ELECTRICIAN';

-- Update existing components with realistic prices
UPDATE calc_components SET
  default_cost_price = CASE code
    WHEN 'STIK-STD' THEN 45
    WHEN 'LOFT-STD' THEN 35
    WHEN 'TAVLE-S' THEN 800
    WHEN 'TAVLE-L' THEN 2500
    WHEN 'STIK-UD' THEN 120
    WHEN 'VAG-STD' THEN 40
    WHEN 'SPOT-STD' THEN 85
    ELSE 50
  END,
  default_sale_price = CASE code
    WHEN 'STIK-STD' THEN 150
    WHEN 'LOFT-STD' THEN 125
    WHEN 'TAVLE-S' THEN 2500
    WHEN 'TAVLE-L' THEN 6500
    WHEN 'STIK-UD' THEN 350
    WHEN 'VAG-STD' THEN 135
    WHEN 'SPOT-STD' THEN 250
    ELSE 175
  END,
  complexity_factor = CASE
    WHEN difficulty_level = 1 THEN 1.0
    WHEN difficulty_level = 2 THEN 1.2
    WHEN difficulty_level = 3 THEN 1.5
    ELSE 1.0
  END
WHERE code IN ('STIK-STD', 'LOFT-STD', 'TAVLE-S', 'TAVLE-L', 'STIK-UD', 'VAG-STD', 'SPOT-STD');

-- =====================================================
-- 7. ADD MORE COMPONENTS
-- =====================================================

-- Add new component categories
INSERT INTO calc_component_categories (name, slug, description, sort_order) VALUES
  ('Rørføring', 'conduit', 'Rør og kabelkanaler', 8),
  ('Kabeltræk', 'cabling', 'Kabeltræk og føring', 9),
  ('Boring', 'drilling', 'Boring og gennemføring', 10),
  ('Montering', 'mounting', 'Montering og fastgørelse', 11)
ON CONFLICT (slug) DO NOTHING;

-- Get category IDs for new components
DO $$
DECLARE
  v_conduit_cat_id UUID;
  v_cabling_cat_id UUID;
  v_drilling_cat_id UUID;
  v_mounting_cat_id UUID;
  v_outlet_cat_id UUID;
BEGIN
  SELECT id INTO v_conduit_cat_id FROM calc_component_categories WHERE slug = 'conduit';
  SELECT id INTO v_cabling_cat_id FROM calc_component_categories WHERE slug = 'cabling';
  SELECT id INTO v_drilling_cat_id FROM calc_component_categories WHERE slug = 'drilling';
  SELECT id INTO v_mounting_cat_id FROM calc_component_categories WHERE slug = 'mounting';
  SELECT id INTO v_outlet_cat_id FROM calc_component_categories WHERE slug = 'outlets';

  -- Rørføring komponenter
  INSERT INTO calc_components (category_id, code, name, description, base_time_minutes, difficulty_level, default_cost_price, default_sale_price, complexity_factor) VALUES
    (v_conduit_cat_id, 'ROER-16', 'Rør 16mm', 'Tomrør 16mm per meter', 5, 1, 8, 25, 1.0),
    (v_conduit_cat_id, 'ROER-20', 'Rør 20mm', 'Tomrør 20mm per meter', 6, 1, 12, 35, 1.0),
    (v_conduit_cat_id, 'ROER-25', 'Rør 25mm', 'Tomrør 25mm per meter', 7, 1, 15, 45, 1.0),
    (v_conduit_cat_id, 'KANAL-S', 'Kabelkanal lille', 'Kabelkanal 20x10mm per meter', 4, 1, 15, 40, 1.0),
    (v_conduit_cat_id, 'KANAL-M', 'Kabelkanal medium', 'Kabelkanal 40x25mm per meter', 5, 1, 25, 60, 1.0),
    (v_conduit_cat_id, 'KANAL-L', 'Kabelkanal stor', 'Kabelkanal 60x40mm per meter', 6, 1, 45, 95, 1.0)
  ON CONFLICT (code) DO NOTHING;

  -- Kabeltræk komponenter
  INSERT INTO calc_components (category_id, code, name, description, base_time_minutes, difficulty_level, default_cost_price, default_sale_price, complexity_factor) VALUES
    (v_cabling_cat_id, 'KABEL-1.5', 'Kabeltræk 3G1.5', 'Kabeltræk 3G1.5mm² per meter', 3, 1, 5, 18, 1.0),
    (v_cabling_cat_id, 'KABEL-2.5', 'Kabeltræk 3G2.5', 'Kabeltræk 3G2.5mm² per meter', 4, 1, 8, 25, 1.0),
    (v_cabling_cat_id, 'KABEL-4', 'Kabeltræk 5G4', 'Kabeltræk 5G4mm² per meter', 5, 2, 18, 45, 1.2),
    (v_cabling_cat_id, 'KABEL-6', 'Kabeltræk 5G6', 'Kabeltræk 5G6mm² per meter', 6, 2, 28, 65, 1.2),
    (v_cabling_cat_id, 'KABEL-10', 'Kabeltræk 5G10', 'Kabeltræk 5G10mm² per meter', 8, 2, 45, 95, 1.2),
    (v_cabling_cat_id, 'KABEL-HOVED', 'Hovedledning', 'Hovedledning per meter', 12, 3, 85, 195, 1.5)
  ON CONFLICT (code) DO NOTHING;

  -- Boring komponenter
  INSERT INTO calc_components (category_id, code, name, description, base_time_minutes, difficulty_level, default_cost_price, default_sale_price, complexity_factor) VALUES
    (v_drilling_cat_id, 'BOR-GIPS', 'Boring gips', 'Boring gennem gipsvæg', 5, 1, 0, 75, 1.0),
    (v_drilling_cat_id, 'BOR-TRAE', 'Boring træ', 'Boring gennem træ', 8, 1, 0, 95, 1.0),
    (v_drilling_cat_id, 'BOR-MUR', 'Boring murværk', 'Boring gennem murværk', 15, 2, 0, 175, 1.2),
    (v_drilling_cat_id, 'BOR-BETON', 'Boring beton', 'Boring gennem beton', 25, 3, 0, 295, 1.5),
    (v_drilling_cat_id, 'GEN-ETAGE', 'Gennemføring etage', 'Gennemføring mellem etager', 45, 3, 0, 495, 1.5),
    (v_drilling_cat_id, 'GEN-BRAND', 'Brandtætning', 'Brandtætning af gennemføring', 20, 2, 85, 295, 1.2)
  ON CONFLICT (code) DO NOTHING;

  -- Montering komponenter
  INSERT INTO calc_components (category_id, code, name, description, base_time_minutes, difficulty_level, default_cost_price, default_sale_price, complexity_factor) VALUES
    (v_mounting_cat_id, 'MONT-LAMPE', 'Montering lampe', 'Montering af lampe/armatur', 15, 1, 0, 195, 1.0),
    (v_mounting_cat_id, 'MONT-SPOT', 'Montering spot', 'Montering af indbygningsspot', 10, 1, 0, 125, 1.0),
    (v_mounting_cat_id, 'MONT-EMHAETTE', 'Montering emhætte', 'Montering og tilslutning af emhætte', 45, 2, 0, 595, 1.2),
    (v_mounting_cat_id, 'MONT-HVIDEVARE', 'Tilslutning hvidevare', 'Tilslutning af hvidevare', 20, 1, 0, 295, 1.0),
    (v_mounting_cat_id, 'MONT-VARMEPUMPE', 'Tilslutning varmepumpe', 'El-tilslutning af varmepumpe', 60, 3, 0, 1495, 1.5),
    (v_mounting_cat_id, 'MONT-LADESTAND', 'Montering ladestander', 'Montering og tilslutning af EV-lader', 90, 3, 0, 2495, 1.5)
  ON CONFLICT (code) DO NOTHING;

  -- Flere stikkontakt varianter
  INSERT INTO calc_components (category_id, code, name, description, base_time_minutes, difficulty_level, default_cost_price, default_sale_price, complexity_factor) VALUES
    (v_outlet_cat_id, 'STIK-DBL', 'Dobbelt stikkontakt', 'Dobbelt stikkontakt', 18, 1, 65, 195, 1.0),
    (v_outlet_cat_id, 'STIK-USB', 'Stikkontakt m/USB', 'Stikkontakt med USB-udtag', 15, 1, 125, 295, 1.0),
    (v_outlet_cat_id, 'STIK-DATA', 'Data-udtag', 'RJ45 data-udtag', 20, 2, 85, 245, 1.2),
    (v_outlet_cat_id, 'STIK-ANTENNE', 'Antenne-udtag', 'TV/radio antenne-udtag', 15, 1, 45, 175, 1.0)
  ON CONFLICT (code) DO NOTHING;

END $$;

-- Add variants to new components that need them
DO $$
DECLARE
  v_comp RECORD;
BEGIN
  -- Add standard variants to drilling components
  FOR v_comp IN
    SELECT id FROM calc_components WHERE code LIKE 'BOR-%' OR code LIKE 'GEN-%'
  LOOP
    INSERT INTO calc_component_variants (component_id, code, name, time_multiplier, extra_minutes, is_default, sort_order) VALUES
      (v_comp.id, 'STD', 'Standard', 1.0, 0, true, 1)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- Add standard variants to mounting components
  FOR v_comp IN
    SELECT id FROM calc_components WHERE code LIKE 'MONT-%'
  LOOP
    INSERT INTO calc_component_variants (component_id, code, name, time_multiplier, extra_minutes, is_default, sort_order) VALUES
      (v_comp.id, 'STD', 'Standard', 1.0, 0, true, 1),
      (v_comp.id, 'HOEJ', 'Over 3m højde', 1.5, 10, false, 2)
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- =====================================================
-- 8. CALCULATION HELPER FUNCTION
-- =====================================================

-- Function to calculate totals for a calculation
CREATE OR REPLACE FUNCTION calculate_calculation_totals(p_calculation_id UUID)
RETURNS TABLE (
  total_time_minutes INTEGER,
  total_materials_cost DECIMAL,
  total_labor_cost DECIMAL,
  total_cost_price DECIMAL,
  total_sale_price DECIMAL,
  db_amount DECIMAL,
  db_percentage DECIMAL
) AS $$
DECLARE
  v_hourly_rate DECIMAL;
  v_time_minutes INTEGER;
  v_materials DECIMAL;
  v_labor DECIMAL;
  v_cost DECIMAL;
  v_sale DECIMAL;
BEGIN
  -- Get default hourly rate
  SELECT (setting_value->>'rate')::DECIMAL INTO v_hourly_rate
  FROM calculation_settings
  WHERE setting_key = 'hourly_rate_electrician';

  IF v_hourly_rate IS NULL THEN
    v_hourly_rate := 495;
  END IF;

  -- Calculate totals from rows
  SELECT
    COALESCE(SUM(cr.time_minutes * cr.quantity), 0)::INTEGER,
    COALESCE(SUM(cr.cost_price * cr.quantity), 0),
    COALESCE(SUM(cr.total), 0)
  INTO v_time_minutes, v_materials, v_sale
  FROM calculation_rows cr
  WHERE cr.calculation_id = p_calculation_id;

  -- Calculate labor cost (time in hours × hourly rate)
  v_labor := (v_time_minutes / 60.0) * v_hourly_rate;

  -- Total cost = materials + labor
  v_cost := v_materials + v_labor;

  -- Return results
  RETURN QUERY SELECT
    v_time_minutes,
    v_materials,
    v_labor,
    v_cost,
    v_sale,
    v_sale - v_cost,
    CASE WHEN v_sale > 0 THEN ((v_sale - v_cost) / v_sale) * 100 ELSE 0 END;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 9. RLS POLICIES
-- =====================================================

-- Enable RLS
ALTER TABLE calculation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_types ENABLE ROW LEVEL SECURITY;

-- Calculation settings policies
CREATE POLICY "Authenticated users can view calculation settings"
  ON calculation_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage calculation settings"
  ON calculation_settings FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Project templates policies
CREATE POLICY "Anyone can view project templates"
  ON project_templates FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "Authenticated users can manage project templates"
  ON project_templates FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Room types policies
CREATE POLICY "Anyone can view room types"
  ON room_types FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "Authenticated users can manage room types"
  ON room_types FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- =====================================================
-- 10. GRANTS
-- =====================================================

GRANT SELECT ON calculation_settings TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON calculation_settings TO authenticated;

GRANT SELECT ON project_templates TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON project_templates TO authenticated;

GRANT SELECT ON room_types TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON room_types TO authenticated;
