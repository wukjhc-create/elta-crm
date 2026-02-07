-- =====================================================
-- AUTO PROJECT ENGINE
-- Intelligent project calculation and automation
-- =====================================================

-- Project interpretations from AI
CREATE TABLE IF NOT EXISTS project_interpretations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Input
  raw_description TEXT NOT NULL,

  -- Extracted data
  building_type TEXT, -- 'house', 'apartment', 'commercial', 'industrial'
  building_size_m2 NUMERIC(10,2),
  building_age_years INTEGER,
  rooms JSONB DEFAULT '[]', -- [{name, size_m2, type}]

  -- Electrical points
  electrical_points JSONB DEFAULT '{}', -- {outlets: 20, switches: 10, spots: 15, ...}
  cable_requirements JSONB DEFAULT '{}', -- {type: meters}
  panel_requirements JSONB DEFAULT '{}', -- {upgrade_needed, groups, amperage}

  -- Complexity analysis
  complexity_score INTEGER DEFAULT 3 CHECK (complexity_score BETWEEN 1 AND 5),
  complexity_factors JSONB DEFAULT '[]', -- ["old building", "concrete walls", ...]

  -- Risk analysis
  risk_score INTEGER DEFAULT 1 CHECK (risk_score BETWEEN 1 AND 5),
  risk_factors JSONB DEFAULT '[]', -- [{type, description, severity}]

  -- AI metadata
  ai_model TEXT DEFAULT 'gpt-4',
  ai_confidence NUMERIC(3,2) DEFAULT 0.80,
  interpretation_time_ms INTEGER,

  -- Timestamps
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Auto-generated calculations from interpretations
CREATE TABLE IF NOT EXISTS auto_calculations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interpretation_id UUID REFERENCES project_interpretations(id) ON DELETE CASCADE,

  -- Component breakdown
  components JSONB DEFAULT '[]', -- [{component_id, quantity, unit_price, total}]
  packages JSONB DEFAULT '[]', -- [{package_id, quantity}]
  materials JSONB DEFAULT '[]', -- [{material_id, supplier_product_id, quantity, unit_price}]

  -- Time calculation
  base_hours NUMERIC(10,2) DEFAULT 0,
  complexity_multiplier NUMERIC(4,2) DEFAULT 1.00,
  size_multiplier NUMERIC(4,2) DEFAULT 1.00,
  accessibility_multiplier NUMERIC(4,2) DEFAULT 1.00,
  total_hours NUMERIC(10,2) DEFAULT 0,

  -- Price calculation
  material_cost NUMERIC(12,2) DEFAULT 0,
  labor_cost NUMERIC(12,2) DEFAULT 0,
  margin_percentage NUMERIC(5,2) DEFAULT 25.00,
  risk_buffer_percentage NUMERIC(5,2) DEFAULT 5.00,
  subtotal NUMERIC(12,2) DEFAULT 0,
  total_price NUMERIC(12,2) DEFAULT 0,

  -- Hourly rates used
  hourly_rate NUMERIC(8,2) DEFAULT 450.00,

  -- Calculation metadata
  calculation_version TEXT DEFAULT 'v2.0',
  calculated_at TIMESTAMPTZ DEFAULT now()
);

-- Risk and warning items
CREATE TABLE IF NOT EXISTS project_risks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interpretation_id UUID REFERENCES project_interpretations(id) ON DELETE CASCADE,

  risk_type TEXT NOT NULL, -- 'electrical', 'structural', 'scope', 'pricing', 'timeline'
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),

  title TEXT NOT NULL,
  description TEXT,
  recommendation TEXT,

  -- For offer
  include_in_offer BOOLEAN DEFAULT false,
  offer_text TEXT, -- Danish text for offer reservations

  -- Internal
  internal_note TEXT,

  created_at TIMESTAMPTZ DEFAULT now()
);

-- Generated offer texts
CREATE TABLE IF NOT EXISTS auto_offer_texts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calculation_id UUID REFERENCES auto_calculations(id) ON DELETE CASCADE,

  -- Offer sections
  work_description TEXT, -- Arbejdsbeskrivelse
  scope_description TEXT, -- Omfang
  materials_description TEXT, -- Materialer
  timeline_description TEXT, -- Tidsplan
  reservations TEXT, -- Forbehold
  terms TEXT, -- Betingelser

  -- Full offer
  full_offer_text TEXT,

  -- Template used
  template_id UUID,

  -- Generation metadata
  generated_at TIMESTAMPTZ DEFAULT now(),
  edited_at TIMESTAMPTZ,
  is_edited BOOLEAN DEFAULT false
);

-- Feedback for self-improvement
CREATE TABLE IF NOT EXISTS calculation_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calculation_id UUID REFERENCES auto_calculations(id) ON DELETE CASCADE,
  offer_id UUID REFERENCES offers(id),
  project_id UUID REFERENCES projects(id),

  -- Estimated vs actual
  estimated_hours NUMERIC(10,2),
  actual_hours NUMERIC(10,2),
  hours_variance_percentage NUMERIC(5,2),

  estimated_material_cost NUMERIC(12,2),
  actual_material_cost NUMERIC(12,2),
  material_variance_percentage NUMERIC(5,2),

  -- Outcome
  offer_accepted BOOLEAN,
  project_profitable BOOLEAN,
  customer_satisfaction INTEGER CHECK (customer_satisfaction BETWEEN 1 AND 5),

  -- Notes
  lessons_learned TEXT,
  adjustment_suggestions JSONB DEFAULT '[]',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Offer text templates
CREATE TABLE IF NOT EXISTS offer_text_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  name TEXT NOT NULL,
  category TEXT, -- 'renovation', 'new_build', 'solar', 'commercial'

  -- Template sections (with placeholders)
  work_description_template TEXT,
  scope_template TEXT,
  materials_template TEXT,
  timeline_template TEXT,
  reservations_template TEXT,
  terms_template TEXT,

  -- Placeholders documentation
  available_placeholders JSONB DEFAULT '[]',

  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,

  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Complexity factors reference
CREATE TABLE IF NOT EXISTS complexity_factors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  category TEXT, -- 'building', 'material', 'access', 'electrical'

  multiplier NUMERIC(4,2) DEFAULT 1.00,
  description TEXT,

  detection_keywords TEXT[], -- Keywords that trigger this factor

  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Insert default complexity factors
INSERT INTO complexity_factors (name, code, category, multiplier, detection_keywords) VALUES
  ('Betonvægge', 'concrete_walls', 'material', 1.40, ARRAY['beton', 'concrete', 'betongulv']),
  ('Gipsvægge', 'drywall', 'material', 0.90, ARRAY['gips', 'gipsvæg', 'gipsplade']),
  ('Trævægge', 'wood_walls', 'material', 1.00, ARRAY['træ', 'trævæg', 'wood']),
  ('Murstensværge', 'brick_walls', 'material', 1.25, ARRAY['mursten', 'mur', 'tegl']),
  ('Gammelt hus (før 1970)', 'old_building', 'building', 1.35, ARRAY['gammelt', 'ældre', '1960', '1950', '1940']),
  ('Nyt byggeri', 'new_construction', 'building', 0.85, ARRAY['nybyggeri', 'nyt hus', 'ny bygning']),
  ('Loftshøjde over 3m', 'high_ceiling', 'access', 1.20, ARRAY['højt loft', 'høje lofter', '3 meter', '4 meter']),
  ('Krybekælder', 'crawl_space', 'access', 1.30, ARRAY['krybekælder', 'lavt', 'kravle']),
  ('Tagetage', 'attic', 'access', 1.15, ARRAY['tagetage', 'loft', 'skråvægge']),
  ('Tavleudskiftning', 'panel_upgrade', 'electrical', 1.25, ARRAY['ny tavle', 'eltavle', 'gruppeudvidelse']),
  ('Jordingsproblemer', 'grounding_issues', 'electrical', 1.40, ARRAY['jording', 'jordforbindelse', 'HFI'])
ON CONFLICT (code) DO NOTHING;

-- Electrical point types reference
CREATE TABLE IF NOT EXISTS electrical_point_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  category TEXT, -- 'outlet', 'switch', 'lighting', 'power', 'data'

  base_time_minutes INTEGER DEFAULT 30,
  base_material_cost NUMERIC(8,2) DEFAULT 0,

  detection_keywords TEXT[],

  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Insert default electrical point types
INSERT INTO electrical_point_types (name, code, category, base_time_minutes, detection_keywords) VALUES
  ('Stikkontakt enkelt', 'outlet_single', 'outlet', 25, ARRAY['stikkontakt', 'stik', 'kontakt']),
  ('Stikkontakt dobbelt', 'outlet_double', 'outlet', 30, ARRAY['dobbelt stik', 'dobbelt kontakt']),
  ('Afbryder', 'switch_single', 'switch', 20, ARRAY['afbryder', 'kontakt', 'tænd/sluk']),
  ('Korrespondanceafbryder', 'switch_multi', 'switch', 35, ARRAY['korrespondance', 'trappeafbryder', 'veksler']),
  ('Dæmper', 'dimmer', 'switch', 30, ARRAY['dæmper', 'dimmer', 'lysdæmper']),
  ('Spotlampe', 'spot_light', 'lighting', 20, ARRAY['spot', 'downlight', 'indbygningsspot']),
  ('Loftlampe', 'ceiling_light', 'lighting', 25, ARRAY['loftlampe', 'pendel', 'loftslampe']),
  ('Udendørs lampe', 'outdoor_light', 'lighting', 40, ARRAY['udendørs', 'udelampe', 'facade']),
  ('Kraftstik 16A', 'power_16a', 'power', 35, ARRAY['16a', 'kraft', 'industri']),
  ('Kraftstik 32A', 'power_32a', 'power', 45, ARRAY['32a', '32 amp']),
  ('Opladerstik EV', 'ev_charger', 'power', 90, ARRAY['elbil', 'lader', 'opladning', 'ev']),
  ('Dataudtag', 'data_outlet', 'data', 30, ARRAY['data', 'netværk', 'ethernet', 'internet']),
  ('Antenne/TV', 'tv_outlet', 'data', 25, ARRAY['antenne', 'tv', 'coax'])
ON CONFLICT (code) DO NOTHING;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_interpretations_created ON project_interpretations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_interpretations_user ON project_interpretations(created_by);
CREATE INDEX IF NOT EXISTS idx_calculations_interpretation ON auto_calculations(interpretation_id);
CREATE INDEX IF NOT EXISTS idx_risks_interpretation ON project_risks(interpretation_id);
CREATE INDEX IF NOT EXISTS idx_offer_texts_calculation ON auto_offer_texts(calculation_id);
CREATE INDEX IF NOT EXISTS idx_feedback_calculation ON calculation_feedback(calculation_id);

-- RLS Policies
ALTER TABLE project_interpretations ENABLE ROW LEVEL SECURITY;
ALTER TABLE auto_calculations ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_risks ENABLE ROW LEVEL SECURITY;
ALTER TABLE auto_offer_texts ENABLE ROW LEVEL SECURITY;
ALTER TABLE calculation_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE offer_text_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE complexity_factors ENABLE ROW LEVEL SECURITY;
ALTER TABLE electrical_point_types ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read/write
CREATE POLICY "Users can manage interpretations" ON project_interpretations FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Users can manage calculations" ON auto_calculations FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Users can manage risks" ON project_risks FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Users can manage offer texts" ON auto_offer_texts FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Users can manage feedback" ON calculation_feedback FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Users can manage templates" ON offer_text_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Users can read factors" ON complexity_factors FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can read point types" ON electrical_point_types FOR SELECT TO authenticated USING (true);

-- Grant permissions
GRANT ALL ON project_interpretations TO authenticated;
GRANT ALL ON auto_calculations TO authenticated;
GRANT ALL ON project_risks TO authenticated;
GRANT ALL ON auto_offer_texts TO authenticated;
GRANT ALL ON calculation_feedback TO authenticated;
GRANT ALL ON offer_text_templates TO authenticated;
GRANT SELECT ON complexity_factors TO authenticated;
GRANT SELECT ON electrical_point_types TO authenticated;
