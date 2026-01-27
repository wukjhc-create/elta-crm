-- =====================================================
-- MIGRATION 00016: Calculation Component Library
-- Description: Reusable components for electrical calculations
-- Used for: House electrical, service jobs, enterprise, solar
-- =====================================================

-- =====================================================
-- 1. COMPONENT CATEGORIES (for organization)
-- =====================================================

CREATE TABLE calc_component_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_calc_component_categories_slug ON calc_component_categories(slug);
CREATE INDEX idx_calc_component_categories_sort_order ON calc_component_categories(sort_order);

-- Insert default categories
INSERT INTO calc_component_categories (name, slug, description, sort_order) VALUES
  ('Stikkontakter', 'outlets', 'Alle typer stikkontakter', 1),
  ('Udtag', 'ceiling-outlets', 'Loft- og vægudtag', 2),
  ('Tavler', 'panels', 'El-tavler og gruppeaflader', 3),
  ('Belysning', 'lighting', 'Lamper og lyskilder', 4),
  ('Kabler', 'cables', 'Kabler og ledninger', 5),
  ('Udendors', 'outdoor', 'Udendors installationer', 6),
  ('Specielle', 'special', 'Specielle installationer', 7);

-- =====================================================
-- 2. MAIN COMPONENTS TABLE
-- =====================================================

CREATE TABLE calc_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT UNIQUE,  -- Short code like 'STIK-STD', 'LOFT-STD'
  category_id UUID REFERENCES calc_component_categories(id) ON DELETE SET NULL,
  description TEXT,
  base_time_minutes INTEGER NOT NULL DEFAULT 0,  -- Base installation time
  difficulty_level INTEGER DEFAULT 1 CHECK (difficulty_level BETWEEN 1 AND 5),
  requires_certification BOOLEAN DEFAULT false,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_calc_components_code ON calc_components(code);
CREATE INDEX idx_calc_components_category_id ON calc_components(category_id);
CREATE INDEX idx_calc_components_is_active ON calc_components(is_active);

CREATE TRIGGER update_calc_components_updated_at
  BEFORE UPDATE ON calc_components
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 3. COMPONENT MATERIALS (default materials per component)
-- =====================================================

CREATE TABLE calc_component_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  component_id UUID NOT NULL REFERENCES calc_components(id) ON DELETE CASCADE,
  product_id UUID REFERENCES product_catalog(id) ON DELETE SET NULL,
  material_name TEXT NOT NULL,  -- Fallback if product_id is null
  quantity DECIMAL(10, 3) NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'stk',
  is_optional BOOLEAN DEFAULT false,
  notes TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_calc_component_materials_component_id ON calc_component_materials(component_id);
CREATE INDEX idx_calc_component_materials_product_id ON calc_component_materials(product_id);

-- =====================================================
-- 4. COMPONENT VARIANTS (wall type, difficulty, etc.)
-- =====================================================

CREATE TABLE calc_component_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  component_id UUID NOT NULL REFERENCES calc_components(id) ON DELETE CASCADE,
  name TEXT NOT NULL,  -- 'Gips', 'Beton', 'Murvark'
  code TEXT,  -- 'GIPS', 'BETON', 'MUR'
  description TEXT,
  time_multiplier DECIMAL(4, 2) DEFAULT 1.00,  -- 1.0 = same time, 2.0 = double time
  extra_minutes INTEGER DEFAULT 0,  -- Additional fixed minutes
  price_multiplier DECIMAL(4, 2) DEFAULT 1.00,
  is_default BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_calc_component_variants_component_id ON calc_component_variants(component_id);
CREATE INDEX idx_calc_component_variants_code ON calc_component_variants(code);

-- Ensure only one default per component
CREATE UNIQUE INDEX idx_calc_component_variants_default
  ON calc_component_variants(component_id)
  WHERE is_default = true;

-- =====================================================
-- 5. VARIANT-SPECIFIC MATERIALS (additional/different materials per variant)
-- =====================================================

CREATE TABLE calc_component_variant_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id UUID NOT NULL REFERENCES calc_component_variants(id) ON DELETE CASCADE,
  product_id UUID REFERENCES product_catalog(id) ON DELETE SET NULL,
  material_name TEXT NOT NULL,
  quantity DECIMAL(10, 3) NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'stk',
  replaces_base BOOLEAN DEFAULT false,  -- If true, replaces base material instead of adding
  notes TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_calc_component_variant_materials_variant_id ON calc_component_variant_materials(variant_id);
CREATE INDEX idx_calc_component_variant_materials_product_id ON calc_component_variant_materials(product_id);

-- =====================================================
-- 6. LABOR RULES (conditional time adjustments)
-- =====================================================

CREATE TABLE calc_component_labor_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  component_id UUID NOT NULL REFERENCES calc_components(id) ON DELETE CASCADE,
  rule_name TEXT NOT NULL,
  condition_type TEXT NOT NULL,  -- 'height', 'quantity', 'access', 'custom'
  condition_value JSONB NOT NULL DEFAULT '{}',
  -- Examples:
  -- { "min_height": 3.0 }
  -- { "min_quantity": 10 }
  -- { "access": "difficult" }
  extra_minutes INTEGER DEFAULT 0,
  time_multiplier DECIMAL(4, 2) DEFAULT 1.00,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_calc_component_labor_rules_component_id ON calc_component_labor_rules(component_id);
CREATE INDEX idx_calc_component_labor_rules_condition_type ON calc_component_labor_rules(condition_type);

-- =====================================================
-- 7. RLS POLICIES
-- =====================================================

ALTER TABLE calc_component_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE calc_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE calc_component_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE calc_component_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE calc_component_variant_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE calc_component_labor_rules ENABLE ROW LEVEL SECURITY;

-- Read access for authenticated users
CREATE POLICY "Authenticated users can read component categories"
  ON calc_component_categories FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read components"
  ON calc_components FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read component materials"
  ON calc_component_materials FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read component variants"
  ON calc_component_variants FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read variant materials"
  ON calc_component_variant_materials FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read labor rules"
  ON calc_component_labor_rules FOR SELECT TO authenticated USING (true);

-- Write access for authenticated users (admin check can be added later)
CREATE POLICY "Authenticated users can manage component categories"
  ON calc_component_categories FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can manage components"
  ON calc_components FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can manage component materials"
  ON calc_component_materials FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can manage component variants"
  ON calc_component_variants FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can manage variant materials"
  ON calc_component_variant_materials FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can manage labor rules"
  ON calc_component_labor_rules FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =====================================================
-- 8. SEED DATA: ELECTRICAL COMPONENTS
-- =====================================================

-- First, ensure we have an electrical category in product_categories
INSERT INTO product_categories (name, slug, sort_order)
VALUES ('El-komponenter', 'electrical', 10)
ON CONFLICT (slug) DO NOTHING;

-- Seed: Standard Stikkontakt
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level)
VALUES (
  'Stikkontakt',
  'STIK-STD',
  (SELECT id FROM calc_component_categories WHERE slug = 'outlets'),
  'Standard stikkontakt 230V',
  30,
  1
);

-- Stikkontakt variants
INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'STIK-STD'), 'Gipsvag', 'GIPS', 1.00, 0, true, 1),
  ((SELECT id FROM calc_components WHERE code = 'STIK-STD'), 'Beton', 'BETON', 1.50, 15, false, 2),
  ((SELECT id FROM calc_components WHERE code = 'STIK-STD'), 'Murvark', 'MUR', 1.30, 10, false, 3),
  ((SELECT id FROM calc_components WHERE code = 'STIK-STD'), 'Trae', 'TRAE', 0.90, 0, false, 4);

-- Stikkontakt base materials
INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'STIK-STD'), 'Stikkontakt 1-fag', 1, 'stk', 1),
  ((SELECT id FROM calc_components WHERE code = 'STIK-STD'), 'Indmuringsdase', 1, 'stk', 2),
  ((SELECT id FROM calc_components WHERE code = 'STIK-STD'), 'Installationskabel 3G1.5', 5, 'm', 3),
  ((SELECT id FROM calc_components WHERE code = 'STIK-STD'), 'Kabelsamler', 2, 'stk', 4);

-- Stikkontakt labor rules
INSERT INTO calc_component_labor_rules (component_id, rule_name, condition_type, condition_value, extra_minutes, description)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'STIK-STD'), 'Hoj placering', 'height', '{"min_height": 2.5}', 10, 'Ekstra tid ved hoj placering'),
  ((SELECT id FROM calc_components WHERE code = 'STIK-STD'), 'Svaer adgang', 'access', '{"type": "difficult"}', 15, 'Ekstra tid ved svar adgang');

-- Seed: Loftudtag
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level)
VALUES (
  'Loftudtag',
  'LOFT-STD',
  (SELECT id FROM calc_component_categories WHERE slug = 'ceiling-outlets'),
  'Standard loftudtag til lampe',
  25,
  1
);

-- Loftudtag variants
INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'LOFT-STD'), 'Gipsloft', 'GIPS', 1.00, 0, true, 1),
  ((SELECT id FROM calc_components WHERE code = 'LOFT-STD'), 'Betonloft', 'BETON', 1.80, 20, false, 2),
  ((SELECT id FROM calc_components WHERE code = 'LOFT-STD'), 'Traloft', 'TRAE', 0.85, 0, false, 3);

-- Loftudtag base materials
INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'LOFT-STD'), 'DCL udtag', 1, 'stk', 1),
  ((SELECT id FROM calc_components WHERE code = 'LOFT-STD'), 'Loftdase', 1, 'stk', 2),
  ((SELECT id FROM calc_components WHERE code = 'LOFT-STD'), 'Installationskabel 3G1.5', 4, 'm', 3);

-- Seed: Lille Tavle
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level)
VALUES (
  'Tavle (lille)',
  'TAVLE-S',
  (SELECT id FROM calc_component_categories WHERE slug = 'panels'),
  'Gruppetavle 6-12 grupper',
  120,
  3
);

-- Lille Tavle variants
INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'TAVLE-S'), 'Gipsvag', 'GIPS', 1.00, 0, true, 1),
  ((SELECT id FROM calc_components WHERE code = 'TAVLE-S'), 'Beton', 'BETON', 1.40, 30, false, 2),
  ((SELECT id FROM calc_components WHERE code = 'TAVLE-S'), 'Murvark', 'MUR', 1.25, 20, false, 3);

-- Lille Tavle base materials
INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'TAVLE-S'), 'Gruppetavle 12 modul', 1, 'stk', 1),
  ((SELECT id FROM calc_components WHERE code = 'TAVLE-S'), 'HPFI 40A', 1, 'stk', 2),
  ((SELECT id FROM calc_components WHERE code = 'TAVLE-S'), 'Automatsikring B16', 6, 'stk', 3),
  ((SELECT id FROM calc_components WHERE code = 'TAVLE-S'), 'Skinne', 1, 'stk', 4),
  ((SELECT id FROM calc_components WHERE code = 'TAVLE-S'), 'Hovedkabel 5G6', 3, 'm', 5);

-- Seed: Stor Tavle
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level)
VALUES (
  'Tavle (stor)',
  'TAVLE-L',
  (SELECT id FROM calc_component_categories WHERE slug = 'panels'),
  'Gruppetavle 18-36 grupper',
  240,
  4
);

-- Stor Tavle variants
INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'TAVLE-L'), 'Gipsvag', 'GIPS', 1.00, 0, true, 1),
  ((SELECT id FROM calc_components WHERE code = 'TAVLE-L'), 'Beton', 'BETON', 1.30, 45, false, 2),
  ((SELECT id FROM calc_components WHERE code = 'TAVLE-L'), 'Murvark', 'MUR', 1.20, 30, false, 3);

-- Stor Tavle base materials
INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'TAVLE-L'), 'Gruppetavle 36 modul', 1, 'stk', 1),
  ((SELECT id FROM calc_components WHERE code = 'TAVLE-L'), 'HPFI 63A', 2, 'stk', 2),
  ((SELECT id FROM calc_components WHERE code = 'TAVLE-L'), 'Automatsikring B16', 12, 'stk', 3),
  ((SELECT id FROM calc_components WHERE code = 'TAVLE-L'), 'Automatsikring B10', 6, 'stk', 4),
  ((SELECT id FROM calc_components WHERE code = 'TAVLE-L'), 'Skinne', 2, 'stk', 5),
  ((SELECT id FROM calc_components WHERE code = 'TAVLE-L'), 'Hovedkabel 5G10', 5, 'm', 6);

-- Seed: Udendors Stikkontakt
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level, requires_certification)
VALUES (
  'Udendors stikkontakt',
  'STIK-UD',
  (SELECT id FROM calc_component_categories WHERE slug = 'outdoor'),
  'Udendors stikkontakt IP44',
  45,
  2,
  false
);

-- Udendors Stikkontakt variants
INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'STIK-UD'), 'Trae/Puds', 'PUDS', 1.00, 0, true, 1),
  ((SELECT id FROM calc_components WHERE code = 'STIK-UD'), 'Mursten', 'MUR', 1.30, 15, false, 2),
  ((SELECT id FROM calc_components WHERE code = 'STIK-UD'), 'Beton', 'BETON', 1.60, 25, false, 3);

-- Udendors Stikkontakt base materials
INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'STIK-UD'), 'Udendors stikkontakt IP44', 1, 'stk', 1),
  ((SELECT id FROM calc_components WHERE code = 'STIK-UD'), 'Udendors dase IP44', 1, 'stk', 2),
  ((SELECT id FROM calc_components WHERE code = 'STIK-UD'), 'Installationskabel 3G2.5', 8, 'm', 3),
  ((SELECT id FROM calc_components WHERE code = 'STIK-UD'), 'Kabelbeskyttelse', 2, 'm', 4);

-- Udendors Stikkontakt labor rules
INSERT INTO calc_component_labor_rules (component_id, rule_name, condition_type, condition_value, extra_minutes, description)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'STIK-UD'), 'Lang kabelfort', 'custom', '{"cable_length_min": 15}', 20, 'Ekstra tid ved lang kabelforing'),
  ((SELECT id FROM calc_components WHERE code = 'STIK-UD'), 'Gravning krevet', 'custom', '{"requires_digging": true}', 60, 'Ekstra tid ved gravning');

-- Seed: Vagudtag (Bonus component)
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level)
VALUES (
  'Vagudtag',
  'VAG-STD',
  (SELECT id FROM calc_component_categories WHERE slug = 'ceiling-outlets'),
  'Standard vagudtag til lampe/spot',
  20,
  1
);

-- Vagudtag variants
INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'VAG-STD'), 'Gipsvag', 'GIPS', 1.00, 0, true, 1),
  ((SELECT id FROM calc_components WHERE code = 'VAG-STD'), 'Beton', 'BETON', 1.70, 15, false, 2),
  ((SELECT id FROM calc_components WHERE code = 'VAG-STD'), 'Murvark', 'MUR', 1.40, 10, false, 3);

-- Vagudtag base materials
INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'VAG-STD'), 'Vagdase', 1, 'stk', 1),
  ((SELECT id FROM calc_components WHERE code = 'VAG-STD'), 'Installationskabel 3G1.5', 3, 'm', 2);

-- Seed: Spot i loft (Bonus component)
INSERT INTO calc_components (name, code, category_id, description, base_time_minutes, difficulty_level)
VALUES (
  'Spot i loft',
  'SPOT-STD',
  (SELECT id FROM calc_component_categories WHERE slug = 'lighting'),
  'Indbygningsspot LED',
  20,
  2
);

-- Spot variants
INSERT INTO calc_component_variants (component_id, name, code, time_multiplier, extra_minutes, is_default, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'SPOT-STD'), 'Gipsloft', 'GIPS', 1.00, 0, true, 1),
  ((SELECT id FROM calc_components WHERE code = 'SPOT-STD'), 'Traloft', 'TRAE', 1.10, 5, false, 2),
  ((SELECT id FROM calc_components WHERE code = 'SPOT-STD'), 'Betonloft (foret)', 'BETON', 1.50, 15, false, 3);

-- Spot base materials
INSERT INTO calc_component_materials (component_id, material_name, quantity, unit, sort_order)
VALUES
  ((SELECT id FROM calc_components WHERE code = 'SPOT-STD'), 'LED indbygningsspot', 1, 'stk', 1),
  ((SELECT id FROM calc_components WHERE code = 'SPOT-STD'), 'LED driver', 0.2, 'stk', 2),
  ((SELECT id FROM calc_components WHERE code = 'SPOT-STD'), 'Installationskabel 3G1.5', 2, 'm', 3),
  ((SELECT id FROM calc_components WHERE code = 'SPOT-STD'), 'Forbindelsesledning', 1, 'stk', 4);

-- =====================================================
-- 9. HELPER VIEW: Component Summary
-- =====================================================

CREATE OR REPLACE VIEW v_calc_components_summary AS
SELECT
  c.id,
  c.code,
  c.name,
  c.description,
  c.base_time_minutes,
  c.difficulty_level,
  cat.name AS category_name,
  cat.slug AS category_slug,
  (SELECT COUNT(*) FROM calc_component_variants WHERE component_id = c.id) AS variant_count,
  (SELECT COUNT(*) FROM calc_component_materials WHERE component_id = c.id) AS material_count,
  (SELECT COUNT(*) FROM calc_component_labor_rules WHERE component_id = c.id) AS rule_count,
  c.is_active,
  c.created_at
FROM calc_components c
LEFT JOIN calc_component_categories cat ON c.category_id = cat.id
ORDER BY cat.sort_order, c.name;

-- Grant access to view
GRANT SELECT ON v_calc_components_summary TO authenticated;

-- =====================================================
-- 10. HELPER FUNCTION: Calculate component time
-- =====================================================

CREATE OR REPLACE FUNCTION calc_component_total_time(
  p_component_id UUID,
  p_variant_code TEXT DEFAULT NULL,
  p_quantity INTEGER DEFAULT 1
) RETURNS INTEGER AS $$
DECLARE
  v_base_time INTEGER;
  v_time_multiplier DECIMAL(4,2) := 1.00;
  v_extra_minutes INTEGER := 0;
  v_total_time INTEGER;
BEGIN
  -- Get base time
  SELECT base_time_minutes INTO v_base_time
  FROM calc_components
  WHERE id = p_component_id;

  IF v_base_time IS NULL THEN
    RETURN 0;
  END IF;

  -- Get variant adjustments if specified
  IF p_variant_code IS NOT NULL THEN
    SELECT time_multiplier, extra_minutes
    INTO v_time_multiplier, v_extra_minutes
    FROM calc_component_variants
    WHERE component_id = p_component_id AND code = p_variant_code;
  END IF;

  -- Calculate total: (base * multiplier + extra) * quantity
  v_total_time := ((v_base_time * v_time_multiplier) + COALESCE(v_extra_minutes, 0)) * p_quantity;

  RETURN v_total_time::INTEGER;
END;
$$ LANGUAGE plpgsql STABLE;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
