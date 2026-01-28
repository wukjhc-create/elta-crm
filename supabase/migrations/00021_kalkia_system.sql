-- =====================================================
-- MIGRATION 00021: Kalkia Professional Calculation System
-- Description: Hierarchical component-based calculation engine
--              with infinite-depth tree, building profiles,
--              global factors, and comprehensive pricing model
-- =====================================================

-- =====================================================
-- 1. ENABLE LTREE EXTENSION (for hierarchical paths)
-- =====================================================

CREATE EXTENSION IF NOT EXISTS ltree;

-- =====================================================
-- 2. KALKIA NODES (Infinite depth tree structure)
-- =====================================================

CREATE TABLE kalkia_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID REFERENCES kalkia_nodes(id) ON DELETE CASCADE,
  path ltree NOT NULL,
  depth INTEGER NOT NULL DEFAULT 0,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  node_type TEXT NOT NULL CHECK (node_type IN ('group', 'operation', 'composite')),
  base_time_seconds INTEGER DEFAULT 0,
  category_id UUID REFERENCES calc_component_categories(id) ON DELETE SET NULL,
  default_cost_price DECIMAL(12,4) DEFAULT 0,
  default_sale_price DECIMAL(12,4) DEFAULT 0,
  difficulty_level INTEGER DEFAULT 1 CHECK (difficulty_level BETWEEN 1 AND 5),
  requires_certification BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  ai_tags TEXT[] DEFAULT '{}',
  notes TEXT,
  sort_order INTEGER DEFAULT 0,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for kalkia_nodes
CREATE INDEX idx_kalkia_nodes_parent ON kalkia_nodes(parent_id);
CREATE INDEX idx_kalkia_nodes_path_gist ON kalkia_nodes USING GIST (path);
CREATE INDEX idx_kalkia_nodes_path_btree ON kalkia_nodes USING BTREE (path);
CREATE INDEX idx_kalkia_nodes_code ON kalkia_nodes(code);
CREATE INDEX idx_kalkia_nodes_node_type ON kalkia_nodes(node_type);
CREATE INDEX idx_kalkia_nodes_category ON kalkia_nodes(category_id);
CREATE INDEX idx_kalkia_nodes_active ON kalkia_nodes(is_active) WHERE is_active = true;
CREATE INDEX idx_kalkia_nodes_depth ON kalkia_nodes(depth);

-- Updated_at trigger
CREATE TRIGGER update_kalkia_nodes_updated_at
  BEFORE UPDATE ON kalkia_nodes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 3. KALKIA VARIANTS (Enhanced with time in seconds)
-- =====================================================

CREATE TABLE kalkia_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id UUID NOT NULL REFERENCES kalkia_nodes(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  base_time_seconds INTEGER DEFAULT 0,
  time_multiplier DECIMAL(5,3) DEFAULT 1.000,
  extra_time_seconds INTEGER DEFAULT 0,
  price_multiplier DECIMAL(5,3) DEFAULT 1.000,
  cost_multiplier DECIMAL(5,3) DEFAULT 1.000,
  waste_percentage DECIMAL(5,2) DEFAULT 0,
  is_default BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(node_id, code)
);

-- Indexes for kalkia_variants
CREATE INDEX idx_kalkia_variants_node ON kalkia_variants(node_id);
CREATE INDEX idx_kalkia_variants_code ON kalkia_variants(code);
CREATE INDEX idx_kalkia_variants_default ON kalkia_variants(node_id) WHERE is_default = true;

-- Ensure only one default per node
CREATE UNIQUE INDEX idx_kalkia_variants_single_default
  ON kalkia_variants(node_id)
  WHERE is_default = true;

-- Updated_at trigger
CREATE TRIGGER update_kalkia_variants_updated_at
  BEFORE UPDATE ON kalkia_variants
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 4. KALKIA VARIANT MATERIALS
-- =====================================================

CREATE TABLE kalkia_variant_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id UUID NOT NULL REFERENCES kalkia_variants(id) ON DELETE CASCADE,
  product_id UUID REFERENCES product_catalog(id) ON DELETE SET NULL,
  material_name TEXT NOT NULL,
  quantity DECIMAL(12,4) NOT NULL DEFAULT 1,
  unit TEXT DEFAULT 'stk',
  cost_price DECIMAL(12,4),
  sale_price DECIMAL(12,4),
  is_optional BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for kalkia_variant_materials
CREATE INDEX idx_kalkia_variant_materials_variant ON kalkia_variant_materials(variant_id);
CREATE INDEX idx_kalkia_variant_materials_product ON kalkia_variant_materials(product_id);

-- =====================================================
-- 5. KALKIA BUILDING PROFILES
-- =====================================================

CREATE TABLE kalkia_building_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  time_multiplier DECIMAL(5,3) DEFAULT 1.000,
  difficulty_multiplier DECIMAL(5,3) DEFAULT 1.000,
  material_waste_multiplier DECIMAL(5,3) DEFAULT 1.000,
  overhead_multiplier DECIMAL(5,3) DEFAULT 1.000,
  typical_wall_type TEXT,
  typical_access TEXT DEFAULT 'normal',
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_kalkia_building_profiles_code ON kalkia_building_profiles(code);
CREATE INDEX idx_kalkia_building_profiles_active ON kalkia_building_profiles(is_active) WHERE is_active = true;

-- Updated_at trigger
CREATE TRIGGER update_kalkia_building_profiles_updated_at
  BEFORE UPDATE ON kalkia_building_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 6. KALKIA GLOBAL FACTORS
-- =====================================================

CREATE TABLE kalkia_global_factors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factor_key TEXT NOT NULL UNIQUE,
  factor_name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL CHECK (category IN ('time', 'cost', 'pricing', 'waste', 'labor')),
  value_type TEXT NOT NULL CHECK (value_type IN ('percentage', 'multiplier', 'fixed')),
  value DECIMAL(10,4) NOT NULL,
  min_value DECIMAL(10,4),
  max_value DECIMAL(10,4),
  applies_to TEXT[] DEFAULT ARRAY['all'],
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_kalkia_global_factors_key ON kalkia_global_factors(factor_key);
CREATE INDEX idx_kalkia_global_factors_category ON kalkia_global_factors(category);
CREATE INDEX idx_kalkia_global_factors_active ON kalkia_global_factors(is_active) WHERE is_active = true;

-- Updated_at trigger
CREATE TRIGGER update_kalkia_global_factors_updated_at
  BEFORE UPDATE ON kalkia_global_factors
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 7. KALKIA RULES (Conditional rules and factors)
-- =====================================================

CREATE TABLE kalkia_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id UUID REFERENCES kalkia_nodes(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES kalkia_variants(id) ON DELETE CASCADE,
  rule_name TEXT NOT NULL,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('height', 'quantity', 'access', 'distance', 'custom')),
  condition JSONB NOT NULL DEFAULT '{}',
  time_multiplier DECIMAL(5,3) DEFAULT 1.000,
  extra_time_seconds INTEGER DEFAULT 0,
  cost_multiplier DECIMAL(5,3) DEFAULT 1.000,
  extra_cost DECIMAL(12,4) DEFAULT 0,
  description TEXT,
  priority INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_kalkia_rules_node ON kalkia_rules(node_id);
CREATE INDEX idx_kalkia_rules_variant ON kalkia_rules(variant_id);
CREATE INDEX idx_kalkia_rules_type ON kalkia_rules(rule_type);
CREATE INDEX idx_kalkia_rules_active ON kalkia_rules(is_active) WHERE is_active = true;

-- =====================================================
-- 8. KALKIA CALCULATIONS (Full pricing model)
-- =====================================================

CREATE TABLE kalkia_calculations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  building_profile_id UUID REFERENCES kalkia_building_profiles(id) ON DELETE SET NULL,

  -- Time tracking (all in seconds)
  total_direct_time_seconds INTEGER DEFAULT 0,
  total_indirect_time_seconds INTEGER DEFAULT 0,
  total_personal_time_seconds INTEGER DEFAULT 0,
  total_labor_time_seconds INTEGER DEFAULT 0,

  -- Cost breakdown
  hourly_rate DECIMAL(10,2) DEFAULT 495,
  total_material_cost DECIMAL(14,2) DEFAULT 0,
  total_material_waste DECIMAL(14,2) DEFAULT 0,
  total_labor_cost DECIMAL(14,2) DEFAULT 0,
  total_other_costs DECIMAL(14,2) DEFAULT 0,
  cost_price DECIMAL(14,2) DEFAULT 0,

  -- Overhead and basis
  overhead_percentage DECIMAL(5,2) DEFAULT 12,
  overhead_amount DECIMAL(14,2) DEFAULT 0,
  risk_percentage DECIMAL(5,2) DEFAULT 0,
  risk_amount DECIMAL(14,2) DEFAULT 0,
  sales_basis DECIMAL(14,2) DEFAULT 0,

  -- Pricing
  margin_percentage DECIMAL(5,2) DEFAULT 0,
  margin_amount DECIMAL(14,2) DEFAULT 0,
  sale_price_excl_vat DECIMAL(14,2) DEFAULT 0,
  discount_percentage DECIMAL(5,2) DEFAULT 0,
  discount_amount DECIMAL(14,2) DEFAULT 0,
  net_price DECIMAL(14,2) DEFAULT 0,
  vat_percentage DECIMAL(5,2) DEFAULT 25,
  vat_amount DECIMAL(14,2) DEFAULT 0,
  final_amount DECIMAL(14,2) DEFAULT 0,

  -- Key metrics (DB = Daekningsbidrag / Contribution margin)
  db_amount DECIMAL(14,2) DEFAULT 0,
  db_percentage DECIMAL(5,2) DEFAULT 0,
  db_per_hour DECIMAL(10,2) DEFAULT 0,
  coverage_ratio DECIMAL(5,2) DEFAULT 0,

  -- Snapshot of factors used
  factors_snapshot JSONB DEFAULT '{}',
  building_profile_snapshot JSONB DEFAULT '{}',

  -- Status
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived', 'converted')),
  is_template BOOLEAN DEFAULT false,

  -- Metadata
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_kalkia_calculations_customer ON kalkia_calculations(customer_id);
CREATE INDEX idx_kalkia_calculations_profile ON kalkia_calculations(building_profile_id);
CREATE INDEX idx_kalkia_calculations_status ON kalkia_calculations(status);
CREATE INDEX idx_kalkia_calculations_template ON kalkia_calculations(is_template) WHERE is_template = true;
CREATE INDEX idx_kalkia_calculations_created_by ON kalkia_calculations(created_by);
CREATE INDEX idx_kalkia_calculations_created_at ON kalkia_calculations(created_at DESC);

-- Updated_at trigger
CREATE TRIGGER update_kalkia_calculations_updated_at
  BEFORE UPDATE ON kalkia_calculations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 9. KALKIA CALCULATION ROWS
-- =====================================================

CREATE TABLE kalkia_calculation_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calculation_id UUID NOT NULL REFERENCES kalkia_calculations(id) ON DELETE CASCADE,
  node_id UUID REFERENCES kalkia_nodes(id) ON DELETE SET NULL,
  variant_id UUID REFERENCES kalkia_variants(id) ON DELETE SET NULL,

  -- Row info
  position INTEGER NOT NULL DEFAULT 0,
  section TEXT,
  description TEXT NOT NULL,

  -- Quantity
  quantity DECIMAL(12,4) NOT NULL DEFAULT 1,
  unit TEXT DEFAULT 'stk',

  -- Time (in seconds)
  base_time_seconds INTEGER DEFAULT 0,
  adjusted_time_seconds INTEGER DEFAULT 0,

  -- Costs
  material_cost DECIMAL(12,4) DEFAULT 0,
  material_waste DECIMAL(12,4) DEFAULT 0,
  labor_cost DECIMAL(12,4) DEFAULT 0,
  total_cost DECIMAL(12,4) DEFAULT 0,

  -- Pricing
  sale_price DECIMAL(12,4) DEFAULT 0,
  total_sale DECIMAL(12,4) DEFAULT 0,

  -- Applied adjustments snapshot
  rules_applied JSONB DEFAULT '[]',
  conditions JSONB DEFAULT '{}',

  -- Display options
  show_on_offer BOOLEAN DEFAULT true,
  is_optional BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_kalkia_calculation_rows_calc ON kalkia_calculation_rows(calculation_id);
CREATE INDEX idx_kalkia_calculation_rows_node ON kalkia_calculation_rows(node_id);
CREATE INDEX idx_kalkia_calculation_rows_position ON kalkia_calculation_rows(calculation_id, position);

-- Updated_at trigger
CREATE TRIGGER update_kalkia_calculation_rows_updated_at
  BEFORE UPDATE ON kalkia_calculation_rows
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 10. ROW LEVEL SECURITY POLICIES
-- =====================================================

ALTER TABLE kalkia_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE kalkia_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE kalkia_variant_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE kalkia_building_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE kalkia_global_factors ENABLE ROW LEVEL SECURITY;
ALTER TABLE kalkia_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE kalkia_calculations ENABLE ROW LEVEL SECURITY;
ALTER TABLE kalkia_calculation_rows ENABLE ROW LEVEL SECURITY;

-- Read policies
CREATE POLICY "Authenticated users can read kalkia_nodes"
  ON kalkia_nodes FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read kalkia_variants"
  ON kalkia_variants FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read kalkia_variant_materials"
  ON kalkia_variant_materials FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read kalkia_building_profiles"
  ON kalkia_building_profiles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read kalkia_global_factors"
  ON kalkia_global_factors FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read kalkia_rules"
  ON kalkia_rules FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read kalkia_calculations"
  ON kalkia_calculations FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read kalkia_calculation_rows"
  ON kalkia_calculation_rows FOR SELECT TO authenticated USING (true);

-- Write policies (admin check can be added later via role check)
CREATE POLICY "Authenticated users can manage kalkia_nodes"
  ON kalkia_nodes FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can manage kalkia_variants"
  ON kalkia_variants FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can manage kalkia_variant_materials"
  ON kalkia_variant_materials FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can manage kalkia_building_profiles"
  ON kalkia_building_profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can manage kalkia_global_factors"
  ON kalkia_global_factors FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can manage kalkia_rules"
  ON kalkia_rules FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can manage kalkia_calculations"
  ON kalkia_calculations FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can manage kalkia_calculation_rows"
  ON kalkia_calculation_rows FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =====================================================
-- 11. SEED DATA: BUILDING PROFILES
-- =====================================================

INSERT INTO kalkia_building_profiles (code, name, description, time_multiplier, difficulty_multiplier, material_waste_multiplier, typical_wall_type, sort_order) VALUES
  ('HOUSE', 'Parcelhus', 'Standard enfamilieshus', 1.000, 1.000, 1.000, 'GIPS', 1),
  ('APARTMENT', 'Lejlighed', 'Lejlighed i etageejendom', 1.100, 1.100, 1.050, 'BETON', 2),
  ('TOWNHOUSE', 'Raekkehus', 'Raekkehus/byhus', 1.050, 1.050, 1.025, 'GIPS', 3),
  ('INDUSTRIAL', 'Erhverv/Industri', 'Erhvervs- og industribygninger', 1.200, 1.300, 1.100, 'BETON', 4),
  ('RENOVATION', 'Renovering', 'Renovering af eksisterende installation', 1.400, 1.500, 1.150, 'MUR', 5),
  ('NEW_BUILD', 'Nybyg', 'Nybyggeri (ror i beton)', 0.900, 0.800, 0.950, 'GIPS', 6),
  ('SUMMER_HOUSE', 'Sommerhus', 'Fritidshus/sommerhus', 1.050, 1.000, 1.025, 'TRAE', 7),
  ('FARM', 'Landbrug', 'Landbrugsejendom', 1.150, 1.200, 1.100, 'MUR', 8);

-- =====================================================
-- 12. SEED DATA: GLOBAL FACTORS
-- =====================================================

INSERT INTO kalkia_global_factors (factor_key, factor_name, description, category, value_type, value, min_value, max_value, sort_order) VALUES
  -- Time factors
  ('indirect_time', 'Indirekte tid', 'Tid til forberedelse, oprydning, transport mellem rum', 'time', 'percentage', 15.00, 5.00, 30.00, 1),
  ('personal_time', 'Personlig tid', 'Pauser, toiletbesog, m.m.', 'time', 'percentage', 8.00, 5.00, 15.00, 2),

  -- Cost factors
  ('overhead', 'Overhead/Administration', 'Faste omkostninger, administration', 'cost', 'percentage', 12.00, 5.00, 25.00, 3),
  ('risk_margin', 'Risikotillaeg', 'Tillaeg for uforudsete udgifter', 'cost', 'percentage', 0.00, 0.00, 15.00, 4),

  -- Waste factors
  ('material_waste', 'Materialespild', 'Standard materialespild', 'waste', 'percentage', 5.00, 2.00, 15.00, 5),
  ('cable_waste', 'Kabelspild', 'Ekstra spild ved kabler', 'waste', 'percentage', 8.00, 5.00, 20.00, 6),

  -- Labor factors
  ('default_hourly_rate', 'Standard timesats', 'Standard timepris for arbejde', 'labor', 'fixed', 495.00, 350.00, 750.00, 7),
  ('apprentice_rate_factor', 'Laerlingefaktor', 'Laerlinge koster mindre', 'labor', 'multiplier', 0.600, 0.400, 0.800, 8),
  ('overtime_factor', 'Overtidsfaktor', 'Tilllag for overarbejde', 'labor', 'multiplier', 1.500, 1.250, 2.000, 9),
  ('weekend_factor', 'Weekendfaktor', 'Tillaeg for weekendarbejde', 'labor', 'multiplier', 1.750, 1.500, 2.500, 10);

-- =====================================================
-- 13. MIGRATE EXISTING CALC_COMPONENTS TO KALKIA_NODES
-- =====================================================

-- Create root node for migrated components
INSERT INTO kalkia_nodes (id, path, depth, code, name, description, node_type, is_active)
VALUES (
  gen_random_uuid(),
  'legacy',
  0,
  'LEGACY',
  'Migrerede komponenter',
  'Komponenter migreret fra det gamle system',
  'group',
  true
);

-- Migrate existing calc_components as operation nodes
INSERT INTO kalkia_nodes (
  parent_id,
  path,
  depth,
  code,
  name,
  description,
  node_type,
  base_time_seconds,
  category_id,
  difficulty_level,
  requires_certification,
  is_active,
  notes,
  created_by,
  created_at
)
SELECT
  (SELECT id FROM kalkia_nodes WHERE code = 'LEGACY'),
  ('legacy.' || COALESCE(cc.code, 'comp_' || cc.id::text))::ltree,
  1,
  'LEG_' || COALESCE(cc.code, 'COMP_' || LEFT(cc.id::text, 8)),
  cc.name,
  cc.description,
  'operation',
  COALESCE(cc.base_time_minutes, 0) * 60,  -- Convert minutes to seconds
  cc.category_id,
  COALESCE(cc.difficulty_level, 1),
  COALESCE(cc.requires_certification, false),
  COALESCE(cc.is_active, true),
  cc.notes,
  cc.created_by,
  cc.created_at
FROM calc_components cc
WHERE NOT EXISTS (
  SELECT 1 FROM kalkia_nodes kn WHERE kn.code = 'LEG_' || COALESCE(cc.code, 'COMP_' || LEFT(cc.id::text, 8))
);

-- Migrate variants
INSERT INTO kalkia_variants (
  node_id,
  code,
  name,
  description,
  time_multiplier,
  extra_time_seconds,
  price_multiplier,
  is_default,
  sort_order,
  created_at
)
SELECT
  kn.id,
  cv.code,
  cv.name,
  cv.description,
  COALESCE(cv.time_multiplier, 1.00),
  COALESCE(cv.extra_minutes, 0) * 60,  -- Convert minutes to seconds
  COALESCE(cv.price_multiplier, 1.00),
  COALESCE(cv.is_default, false),
  COALESCE(cv.sort_order, 0),
  cv.created_at
FROM calc_component_variants cv
JOIN calc_components cc ON cv.component_id = cc.id
JOIN kalkia_nodes kn ON kn.code = 'LEG_' || COALESCE(cc.code, 'COMP_' || LEFT(cc.id::text, 8))
WHERE NOT EXISTS (
  SELECT 1 FROM kalkia_variants kv
  WHERE kv.node_id = kn.id AND kv.code = cv.code
);

-- Migrate materials (to default variant or create one)
-- First, ensure each migrated node has a default variant
INSERT INTO kalkia_variants (node_id, code, name, is_default, sort_order)
SELECT kn.id, 'DEFAULT', 'Standard', true, 0
FROM kalkia_nodes kn
WHERE kn.path <@ 'legacy'
  AND kn.node_type = 'operation'
  AND NOT EXISTS (
    SELECT 1 FROM kalkia_variants kv WHERE kv.node_id = kn.id
  );

-- Then migrate materials to default variants
INSERT INTO kalkia_variant_materials (
  variant_id,
  product_id,
  material_name,
  quantity,
  unit,
  is_optional,
  sort_order,
  created_at
)
SELECT
  kv.id,
  cm.product_id,
  cm.material_name,
  COALESCE(cm.quantity, 1),
  COALESCE(cm.unit, 'stk'),
  COALESCE(cm.is_optional, false),
  COALESCE(cm.sort_order, 0),
  cm.created_at
FROM calc_component_materials cm
JOIN calc_components cc ON cm.component_id = cc.id
JOIN kalkia_nodes kn ON kn.code = 'LEG_' || COALESCE(cc.code, 'COMP_' || LEFT(cc.id::text, 8))
JOIN kalkia_variants kv ON kv.node_id = kn.id AND kv.is_default = true
WHERE NOT EXISTS (
  SELECT 1 FROM kalkia_variant_materials kvm
  WHERE kvm.variant_id = kv.id AND kvm.material_name = cm.material_name
);

-- Migrate labor rules
INSERT INTO kalkia_rules (
  node_id,
  rule_name,
  rule_type,
  condition,
  time_multiplier,
  extra_time_seconds,
  description,
  is_active,
  created_at
)
SELECT
  kn.id,
  lr.rule_name,
  lr.condition_type,
  COALESCE(lr.condition_value, '{}'),
  COALESCE(lr.time_multiplier, 1.00),
  COALESCE(lr.extra_minutes, 0) * 60,  -- Convert minutes to seconds
  lr.description,
  COALESCE(lr.is_active, true),
  lr.created_at
FROM calc_component_labor_rules lr
JOIN calc_components cc ON lr.component_id = cc.id
JOIN kalkia_nodes kn ON kn.code = 'LEG_' || COALESCE(cc.code, 'COMP_' || LEFT(cc.id::text, 8))
WHERE NOT EXISTS (
  SELECT 1 FROM kalkia_rules kr
  WHERE kr.node_id = kn.id AND kr.rule_name = lr.rule_name
);

-- =====================================================
-- 14. CREATE EXAMPLE CATEGORY GROUPS
-- =====================================================

-- Create category-based group nodes
INSERT INTO kalkia_nodes (path, depth, code, name, description, node_type, sort_order)
SELECT
  cat.slug::ltree,
  0,
  'CAT_' || UPPER(cat.slug),
  cat.name,
  cat.description,
  'group',
  cat.sort_order
FROM calc_component_categories cat
WHERE NOT EXISTS (
  SELECT 1 FROM kalkia_nodes kn WHERE kn.code = 'CAT_' || UPPER(cat.slug)
);

-- =====================================================
-- 15. HELPER VIEWS
-- =====================================================

-- Node summary view with statistics
CREATE OR REPLACE VIEW v_kalkia_nodes_summary AS
SELECT
  n.id,
  n.code,
  n.name,
  n.description,
  n.node_type,
  n.path::text AS path,
  n.depth,
  n.base_time_seconds,
  n.default_cost_price,
  n.default_sale_price,
  n.difficulty_level,
  n.is_active,
  cat.name AS category_name,
  cat.slug AS category_slug,
  (SELECT COUNT(*) FROM kalkia_nodes c WHERE c.parent_id = n.id) AS child_count,
  (SELECT COUNT(*) FROM kalkia_variants v WHERE v.node_id = n.id) AS variant_count,
  (SELECT COUNT(*) FROM kalkia_rules r WHERE r.node_id = n.id) AS rule_count,
  n.created_at,
  n.updated_at
FROM kalkia_nodes n
LEFT JOIN calc_component_categories cat ON n.category_id = cat.id;

-- Calculation summary view
CREATE OR REPLACE VIEW v_kalkia_calculations_summary AS
SELECT
  c.id,
  c.name,
  c.description,
  c.status,
  c.is_template,
  cust.company_name AS customer_name,
  bp.name AS building_profile_name,
  c.total_labor_time_seconds,
  ROUND(c.total_labor_time_seconds / 3600.0, 2) AS total_labor_hours,
  c.total_material_cost,
  c.total_labor_cost,
  c.cost_price,
  c.sale_price_excl_vat,
  c.final_amount,
  c.db_amount,
  c.db_percentage,
  c.db_per_hour,
  c.coverage_ratio,
  (SELECT COUNT(*) FROM kalkia_calculation_rows r WHERE r.calculation_id = c.id) AS row_count,
  p.full_name AS created_by_name,
  c.created_at,
  c.updated_at
FROM kalkia_calculations c
LEFT JOIN customers cust ON c.customer_id = cust.id
LEFT JOIN kalkia_building_profiles bp ON c.building_profile_id = bp.id
LEFT JOIN profiles p ON c.created_by = p.id;

-- Grant access to views
GRANT SELECT ON v_kalkia_nodes_summary TO authenticated;
GRANT SELECT ON v_kalkia_calculations_summary TO authenticated;

-- =====================================================
-- 16. HELPER FUNCTIONS
-- =====================================================

-- Function to get all descendants of a node
CREATE OR REPLACE FUNCTION kalkia_get_descendants(p_node_id UUID)
RETURNS SETOF kalkia_nodes AS $$
DECLARE
  v_path ltree;
BEGIN
  SELECT path INTO v_path FROM kalkia_nodes WHERE id = p_node_id;
  IF v_path IS NULL THEN
    RETURN;
  END IF;
  RETURN QUERY SELECT * FROM kalkia_nodes WHERE path <@ v_path AND id != p_node_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to get all ancestors of a node
CREATE OR REPLACE FUNCTION kalkia_get_ancestors(p_node_id UUID)
RETURNS SETOF kalkia_nodes AS $$
DECLARE
  v_path ltree;
BEGIN
  SELECT path INTO v_path FROM kalkia_nodes WHERE id = p_node_id;
  IF v_path IS NULL THEN
    RETURN;
  END IF;
  RETURN QUERY SELECT * FROM kalkia_nodes WHERE v_path <@ path AND id != p_node_id ORDER BY depth;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to calculate total time for a node with variant
CREATE OR REPLACE FUNCTION kalkia_calc_node_time(
  p_node_id UUID,
  p_variant_id UUID DEFAULT NULL,
  p_quantity DECIMAL DEFAULT 1
) RETURNS INTEGER AS $$
DECLARE
  v_base_time INTEGER;
  v_time_multiplier DECIMAL(5,3) := 1.000;
  v_extra_time INTEGER := 0;
  v_total_time INTEGER;
BEGIN
  -- Get base time from node
  SELECT base_time_seconds INTO v_base_time
  FROM kalkia_nodes
  WHERE id = p_node_id;

  IF v_base_time IS NULL THEN
    RETURN 0;
  END IF;

  -- Get variant adjustments if specified
  IF p_variant_id IS NOT NULL THEN
    SELECT
      COALESCE(time_multiplier, 1.000),
      COALESCE(extra_time_seconds, 0) + COALESCE(base_time_seconds, 0)
    INTO v_time_multiplier, v_extra_time
    FROM kalkia_variants
    WHERE id = p_variant_id;
  END IF;

  -- Calculate total: (base * multiplier + extra) * quantity
  v_total_time := ((v_base_time * v_time_multiplier) + COALESCE(v_extra_time, 0)) * p_quantity;

  RETURN v_total_time::INTEGER;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to recalculate calculation totals
CREATE OR REPLACE FUNCTION kalkia_recalculate_totals(p_calculation_id UUID)
RETURNS VOID AS $$
DECLARE
  v_direct_time INTEGER;
  v_material_cost DECIMAL(14,2);
  v_material_waste DECIMAL(14,2);
  v_labor_cost DECIMAL(14,2);
  v_indirect_factor DECIMAL(10,4);
  v_personal_factor DECIMAL(10,4);
  v_overhead_factor DECIMAL(10,4);
  v_hourly_rate DECIMAL(10,2);
  v_indirect_time INTEGER;
  v_personal_time INTEGER;
  v_total_labor_time INTEGER;
  v_cost_price DECIMAL(14,2);
  v_overhead_amount DECIMAL(14,2);
  v_sales_basis DECIMAL(14,2);
  v_margin_pct DECIMAL(5,2);
  v_margin_amount DECIMAL(14,2);
  v_sale_price DECIMAL(14,2);
  v_discount_pct DECIMAL(5,2);
  v_discount_amount DECIMAL(14,2);
  v_net_price DECIMAL(14,2);
  v_vat_pct DECIMAL(5,2);
  v_vat_amount DECIMAL(14,2);
  v_final_amount DECIMAL(14,2);
  v_db_amount DECIMAL(14,2);
  v_db_percentage DECIMAL(5,2);
  v_db_per_hour DECIMAL(10,2);
  v_labor_hours DECIMAL(10,2);
BEGIN
  -- Get row totals
  SELECT
    COALESCE(SUM(adjusted_time_seconds), 0),
    COALESCE(SUM(material_cost), 0),
    COALESCE(SUM(material_waste), 0)
  INTO v_direct_time, v_material_cost, v_material_waste
  FROM kalkia_calculation_rows
  WHERE calculation_id = p_calculation_id;

  -- Get global factors
  SELECT COALESCE(value / 100, 0.15) INTO v_indirect_factor
  FROM kalkia_global_factors WHERE factor_key = 'indirect_time' AND is_active = true;

  SELECT COALESCE(value / 100, 0.08) INTO v_personal_factor
  FROM kalkia_global_factors WHERE factor_key = 'personal_time' AND is_active = true;

  SELECT COALESCE(value / 100, 0.12) INTO v_overhead_factor
  FROM kalkia_global_factors WHERE factor_key = 'overhead' AND is_active = true;

  -- Get calculation settings
  SELECT hourly_rate, margin_percentage, discount_percentage, vat_percentage
  INTO v_hourly_rate, v_margin_pct, v_discount_pct, v_vat_pct
  FROM kalkia_calculations WHERE id = p_calculation_id;

  -- Calculate time components
  v_indirect_time := ROUND(v_direct_time * v_indirect_factor);
  v_personal_time := ROUND(v_direct_time * v_personal_factor);
  v_total_labor_time := v_direct_time + v_indirect_time + v_personal_time;
  v_labor_hours := v_total_labor_time / 3600.0;
  v_labor_cost := v_labor_hours * v_hourly_rate;

  -- Calculate costs
  v_cost_price := v_material_cost + v_material_waste + v_labor_cost;
  v_overhead_amount := v_cost_price * v_overhead_factor;
  v_sales_basis := v_cost_price + v_overhead_amount;

  -- Calculate pricing
  v_margin_amount := v_sales_basis * (v_margin_pct / 100);
  v_sale_price := v_sales_basis + v_margin_amount;
  v_discount_amount := v_sale_price * (v_discount_pct / 100);
  v_net_price := v_sale_price - v_discount_amount;
  v_vat_amount := v_net_price * (v_vat_pct / 100);
  v_final_amount := v_net_price + v_vat_amount;

  -- Calculate key metrics
  v_db_amount := v_net_price - v_cost_price;
  v_db_percentage := CASE WHEN v_net_price > 0 THEN (v_db_amount / v_net_price) * 100 ELSE 0 END;
  v_db_per_hour := CASE WHEN v_labor_hours > 0 THEN v_db_amount / v_labor_hours ELSE 0 END;

  -- Update calculation
  UPDATE kalkia_calculations SET
    total_direct_time_seconds = v_direct_time,
    total_indirect_time_seconds = v_indirect_time,
    total_personal_time_seconds = v_personal_time,
    total_labor_time_seconds = v_total_labor_time,
    total_material_cost = v_material_cost,
    total_material_waste = v_material_waste,
    total_labor_cost = v_labor_cost,
    cost_price = v_cost_price,
    overhead_amount = v_overhead_amount,
    sales_basis = v_sales_basis,
    margin_amount = v_margin_amount,
    sale_price_excl_vat = v_sale_price,
    discount_amount = v_discount_amount,
    net_price = v_net_price,
    vat_amount = v_vat_amount,
    final_amount = v_final_amount,
    db_amount = v_db_amount,
    db_percentage = v_db_percentage,
    db_per_hour = v_db_per_hour,
    coverage_ratio = v_db_percentage,
    updated_at = NOW()
  WHERE id = p_calculation_id;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-recalculate on row changes
CREATE OR REPLACE FUNCTION kalkia_row_change_trigger()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM kalkia_recalculate_totals(OLD.calculation_id);
    RETURN OLD;
  ELSE
    PERFORM kalkia_recalculate_totals(NEW.calculation_id);
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_kalkia_row_recalculate
  AFTER INSERT OR UPDATE OR DELETE ON kalkia_calculation_rows
  FOR EACH ROW
  EXECUTE FUNCTION kalkia_row_change_trigger();

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
