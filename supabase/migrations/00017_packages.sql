-- =====================================================
-- 00017_packages.sql
-- Package System - Reusable bundles of components/products
-- Similar to Jublo's package functionality
-- =====================================================

-- =====================================================
-- 1. PACKAGE CATEGORIES TABLE
-- =====================================================

CREATE TABLE package_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX idx_package_categories_slug ON package_categories(slug);
CREATE INDEX idx_package_categories_sort_order ON package_categories(sort_order);

-- Insert default categories
INSERT INTO package_categories (name, slug, sort_order) VALUES
  ('Stikkontakter', 'outlets', 1),
  ('Belysning', 'lighting', 2),
  ('Tavler', 'panels', 3),
  ('Solceller', 'solar', 4),
  ('El-installationer', 'electrical', 5),
  ('Service', 'service', 6),
  ('Andet', 'other', 99);

-- =====================================================
-- 2. PACKAGES TABLE
-- =====================================================

CREATE TABLE packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Basic info
  name TEXT NOT NULL,
  code TEXT UNIQUE,  -- 'PKG-STIK-001', 'PKG-SOL-BASIC'
  description TEXT,
  category_id UUID REFERENCES package_categories(id) ON DELETE SET NULL,

  -- Auto-calculated totals (updated by trigger)
  total_cost_price DECIMAL(12, 2) DEFAULT 0,
  total_sale_price DECIMAL(12, 2) DEFAULT 0,
  db_amount DECIMAL(12, 2) DEFAULT 0,  -- Dækningsbidrag (sale - cost)
  db_percentage DECIMAL(5, 2) DEFAULT 0,  -- DB%
  total_time_minutes INTEGER DEFAULT 0,

  -- Settings
  default_markup_percentage DECIMAL(5, 2) DEFAULT 25,
  is_active BOOLEAN DEFAULT true,
  is_template BOOLEAN DEFAULT false,  -- Can be used as starting point

  -- Metadata
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_packages_code ON packages(code);
CREATE INDEX idx_packages_name ON packages(name);
CREATE INDEX idx_packages_category_id ON packages(category_id);
CREATE INDEX idx_packages_is_active ON packages(is_active);
CREATE INDEX idx_packages_created_by ON packages(created_by);

-- Trigger for updated_at
CREATE TRIGGER update_packages_updated_at
  BEFORE UPDATE ON packages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 3. PACKAGE ITEMS TABLE
-- =====================================================

-- Enum for package item types
CREATE TYPE package_item_type AS ENUM ('component', 'product', 'manual', 'time');

CREATE TABLE package_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES packages(id) ON DELETE CASCADE,

  -- Item type determines which reference is used
  item_type package_item_type NOT NULL DEFAULT 'manual',

  -- References (only one should be set based on item_type)
  component_id UUID REFERENCES calc_components(id) ON DELETE SET NULL,
  component_variant_code TEXT,  -- e.g., 'GIPS', 'BETON'
  product_id UUID REFERENCES product_catalog(id) ON DELETE SET NULL,

  -- Item details (used for manual/time or as override)
  description TEXT NOT NULL,
  quantity DECIMAL(10, 2) NOT NULL DEFAULT 1,
  unit TEXT DEFAULT 'stk',

  -- Pricing
  cost_price DECIMAL(12, 2) DEFAULT 0,
  sale_price DECIMAL(12, 2) DEFAULT 0,

  -- Time (minutes)
  time_minutes INTEGER DEFAULT 0,

  -- Calculated (updated by trigger)
  total_cost DECIMAL(12, 2) DEFAULT 0,
  total_sale DECIMAL(12, 2) DEFAULT 0,
  total_time INTEGER DEFAULT 0,

  -- Display
  sort_order INTEGER DEFAULT 0,
  show_on_offer BOOLEAN DEFAULT true,
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_package_items_package_id ON package_items(package_id);
CREATE INDEX idx_package_items_item_type ON package_items(item_type);
CREATE INDEX idx_package_items_component_id ON package_items(component_id);
CREATE INDEX idx_package_items_product_id ON package_items(product_id);
CREATE INDEX idx_package_items_sort_order ON package_items(sort_order);

-- Trigger for updated_at
CREATE TRIGGER update_package_items_updated_at
  BEFORE UPDATE ON package_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 4. TRIGGER FUNCTIONS
-- =====================================================

-- Function to calculate package item totals before insert/update
CREATE OR REPLACE FUNCTION calculate_package_item_totals()
RETURNS TRIGGER AS $$
DECLARE
  v_component RECORD;
  v_variant RECORD;
  v_product RECORD;
  v_base_time INTEGER;
  v_time_multiplier DECIMAL;
  v_extra_minutes INTEGER;
BEGIN
  -- Calculate based on item_type
  CASE NEW.item_type
    WHEN 'component' THEN
      -- Get component data
      IF NEW.component_id IS NOT NULL THEN
        SELECT * INTO v_component FROM calc_components WHERE id = NEW.component_id;

        IF v_component IS NOT NULL THEN
          -- Use component defaults if not overridden
          IF NEW.description IS NULL OR NEW.description = '' THEN
            NEW.description := v_component.name;
          END IF;

          -- Get base time
          v_base_time := v_component.base_time_minutes;
          v_time_multiplier := 1.0;
          v_extra_minutes := 0;

          -- Check for variant
          IF NEW.component_variant_code IS NOT NULL THEN
            SELECT * INTO v_variant
            FROM calc_component_variants
            WHERE component_id = NEW.component_id
              AND code = NEW.component_variant_code;

            IF v_variant IS NOT NULL THEN
              v_time_multiplier := COALESCE(v_variant.time_multiplier, 1.0);
              v_extra_minutes := COALESCE(v_variant.extra_minutes, 0);
            END IF;
          END IF;

          -- Calculate time per unit
          NEW.time_minutes := CEIL(v_base_time * v_time_multiplier + v_extra_minutes);
        END IF;
      END IF;

    WHEN 'product' THEN
      -- Get product data
      IF NEW.product_id IS NOT NULL THEN
        SELECT * INTO v_product FROM product_catalog WHERE id = NEW.product_id;

        IF v_product IS NOT NULL THEN
          -- Use product defaults if not overridden
          IF NEW.description IS NULL OR NEW.description = '' THEN
            NEW.description := v_product.name;
          END IF;
          IF NEW.unit IS NULL OR NEW.unit = '' THEN
            NEW.unit := v_product.unit;
          END IF;
          IF NEW.cost_price IS NULL OR NEW.cost_price = 0 THEN
            NEW.cost_price := COALESCE(v_product.cost_price, 0);
          END IF;
          IF NEW.sale_price IS NULL OR NEW.sale_price = 0 THEN
            NEW.sale_price := COALESCE(v_product.list_price, 0);
          END IF;
        END IF;
      END IF;

    WHEN 'time' THEN
      -- Time rows: quantity is hours, convert to minutes
      NEW.time_minutes := COALESCE(NEW.quantity, 0) * 60;
      NEW.unit := 'timer';

    ELSE
      -- Manual: use values as provided
      NULL;
  END CASE;

  -- Calculate totals
  NEW.total_cost := COALESCE(NEW.cost_price, 0) * COALESCE(NEW.quantity, 1);
  NEW.total_sale := COALESCE(NEW.sale_price, 0) * COALESCE(NEW.quantity, 1);
  NEW.total_time := COALESCE(NEW.time_minutes, 0) * COALESCE(NEW.quantity, 1);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for package item calculations
CREATE TRIGGER trigger_calculate_package_item_totals
  BEFORE INSERT OR UPDATE ON package_items
  FOR EACH ROW
  EXECUTE FUNCTION calculate_package_item_totals();

-- Function to update package totals when items change
CREATE OR REPLACE FUNCTION update_package_totals()
RETURNS TRIGGER AS $$
DECLARE
  v_package_id UUID;
  v_total_cost DECIMAL(12, 2);
  v_total_sale DECIMAL(12, 2);
  v_total_time INTEGER;
  v_db_amount DECIMAL(12, 2);
  v_db_percentage DECIMAL(5, 2);
BEGIN
  -- Get package ID
  IF TG_OP = 'DELETE' THEN
    v_package_id := OLD.package_id;
  ELSE
    v_package_id := NEW.package_id;
  END IF;

  -- Calculate totals from all items
  SELECT
    COALESCE(SUM(total_cost), 0),
    COALESCE(SUM(total_sale), 0),
    COALESCE(SUM(total_time), 0)
  INTO v_total_cost, v_total_sale, v_total_time
  FROM package_items
  WHERE package_id = v_package_id;

  -- Calculate DB (Dækningsbidrag)
  v_db_amount := v_total_sale - v_total_cost;
  v_db_percentage := CASE
    WHEN v_total_sale > 0 THEN (v_db_amount / v_total_sale) * 100
    ELSE 0
  END;

  -- Update package
  UPDATE packages SET
    total_cost_price = v_total_cost,
    total_sale_price = v_total_sale,
    db_amount = v_db_amount,
    db_percentage = v_db_percentage,
    total_time_minutes = v_total_time,
    updated_at = NOW()
  WHERE id = v_package_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Trigger for package totals
CREATE TRIGGER trigger_update_package_totals
  AFTER INSERT OR UPDATE OR DELETE ON package_items
  FOR EACH ROW
  EXECUTE FUNCTION update_package_totals();

-- =====================================================
-- 5. HELPER VIEWS
-- =====================================================

-- View for package summary with item counts
CREATE OR REPLACE VIEW v_packages_summary AS
SELECT
  p.id,
  p.code,
  p.name,
  p.description,
  pc.name AS category_name,
  p.total_cost_price,
  p.total_sale_price,
  p.db_amount,
  p.db_percentage,
  p.total_time_minutes,
  p.is_active,
  COUNT(pi.id) AS item_count,
  COUNT(CASE WHEN pi.item_type = 'component' THEN 1 END) AS component_count,
  COUNT(CASE WHEN pi.item_type = 'product' THEN 1 END) AS product_count,
  COUNT(CASE WHEN pi.item_type = 'manual' THEN 1 END) AS manual_count,
  COUNT(CASE WHEN pi.item_type = 'time' THEN 1 END) AS time_count,
  p.created_at,
  p.updated_at
FROM packages p
LEFT JOIN package_categories pc ON p.category_id = pc.id
LEFT JOIN package_items pi ON p.id = pi.package_id
GROUP BY p.id, pc.name;

-- =====================================================
-- 6. HELPER FUNCTIONS
-- =====================================================

-- Function to copy a package (for creating variations)
CREATE OR REPLACE FUNCTION copy_package(
  p_source_id UUID,
  p_new_name TEXT DEFAULT NULL,
  p_new_code TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_new_package_id UUID;
  v_source RECORD;
BEGIN
  -- Get source package
  SELECT * INTO v_source FROM packages WHERE id = p_source_id;

  IF v_source IS NULL THEN
    RAISE EXCEPTION 'Source package not found';
  END IF;

  -- Create new package
  INSERT INTO packages (
    name, code, description, category_id,
    default_markup_percentage, is_active, is_template, created_by
  ) VALUES (
    COALESCE(p_new_name, v_source.name || ' (Kopi)'),
    p_new_code,
    v_source.description,
    v_source.category_id,
    v_source.default_markup_percentage,
    true,
    false,
    v_source.created_by
  ) RETURNING id INTO v_new_package_id;

  -- Copy items
  INSERT INTO package_items (
    package_id, item_type, component_id, component_variant_code,
    product_id, description, quantity, unit, cost_price, sale_price,
    time_minutes, sort_order, show_on_offer, notes
  )
  SELECT
    v_new_package_id, item_type, component_id, component_variant_code,
    product_id, description, quantity, unit, cost_price, sale_price,
    time_minutes, sort_order, show_on_offer, notes
  FROM package_items
  WHERE package_id = p_source_id
  ORDER BY sort_order;

  RETURN v_new_package_id;
END;
$$ LANGUAGE plpgsql;

-- Function to insert package into calculation
CREATE OR REPLACE FUNCTION insert_package_into_calculation(
  p_package_id UUID,
  p_calculation_id UUID,
  p_starting_position INTEGER DEFAULT 0,
  p_quantity_multiplier DECIMAL DEFAULT 1
) RETURNS INTEGER AS $$
DECLARE
  v_item RECORD;
  v_position INTEGER;
  v_inserted_count INTEGER := 0;
BEGIN
  v_position := p_starting_position;

  -- Get next position if not specified
  IF v_position = 0 THEN
    SELECT COALESCE(MAX(position), 0) + 1 INTO v_position
    FROM calculation_rows
    WHERE calculation_id = p_calculation_id;
  END IF;

  -- Insert each package item as a calculation row
  FOR v_item IN
    SELECT * FROM package_items
    WHERE package_id = p_package_id
    ORDER BY sort_order
  LOOP
    INSERT INTO calculation_rows (
      calculation_id,
      row_type,
      product_id,
      section,
      position,
      description,
      quantity,
      unit,
      cost_price,
      sale_price,
      total,
      show_on_offer
    ) VALUES (
      p_calculation_id,
      CASE v_item.item_type
        WHEN 'product' THEN 'product'::calculation_row_type
        ELSE 'manual'::calculation_row_type
      END,
      v_item.product_id,
      CASE v_item.item_type
        WHEN 'component' THEN 'Materialer'
        WHEN 'product' THEN 'Materialer'
        WHEN 'time' THEN 'Arbejdsløn'
        ELSE 'Andet'
      END,
      v_position,
      v_item.description,
      v_item.quantity * p_quantity_multiplier,
      v_item.unit,
      v_item.cost_price,
      v_item.sale_price,
      v_item.total_sale * p_quantity_multiplier,
      v_item.show_on_offer
    );

    v_position := v_position + 1;
    v_inserted_count := v_inserted_count + 1;
  END LOOP;

  RETURN v_inserted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to insert package into offer
CREATE OR REPLACE FUNCTION insert_package_into_offer(
  p_package_id UUID,
  p_offer_id UUID,
  p_starting_position INTEGER DEFAULT 0,
  p_quantity_multiplier DECIMAL DEFAULT 1
) RETURNS INTEGER AS $$
DECLARE
  v_item RECORD;
  v_position INTEGER;
  v_inserted_count INTEGER := 0;
BEGIN
  v_position := p_starting_position;

  -- Get next position if not specified
  IF v_position = 0 THEN
    SELECT COALESCE(MAX(position), 0) + 1 INTO v_position
    FROM offer_line_items
    WHERE offer_id = p_offer_id;
  END IF;

  -- Insert each package item as an offer line item
  FOR v_item IN
    SELECT * FROM package_items
    WHERE package_id = p_package_id
      AND show_on_offer = true
    ORDER BY sort_order
  LOOP
    INSERT INTO offer_line_items (
      offer_id,
      position,
      description,
      quantity,
      unit,
      unit_price,
      total_price,
      product_id,
      cost_price,
      line_type,
      section
    ) VALUES (
      p_offer_id,
      v_position,
      v_item.description,
      v_item.quantity * p_quantity_multiplier,
      v_item.unit,
      v_item.sale_price,
      v_item.total_sale * p_quantity_multiplier,
      v_item.product_id,
      v_item.cost_price,
      CASE v_item.item_type
        WHEN 'product' THEN 'product'
        ELSE 'manual'
      END,
      CASE v_item.item_type
        WHEN 'component' THEN 'Materialer'
        WHEN 'product' THEN 'Materialer'
        WHEN 'time' THEN 'Arbejdsløn'
        ELSE 'Andet'
      END
    );

    v_position := v_position + 1;
    v_inserted_count := v_inserted_count + 1;
  END LOOP;

  RETURN v_inserted_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 7. RLS POLICIES
-- =====================================================

-- Enable RLS
ALTER TABLE package_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE package_items ENABLE ROW LEVEL SECURITY;

-- Package categories policies
CREATE POLICY "Anyone can view package categories"
  ON package_categories FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "Authenticated users can manage package categories"
  ON package_categories FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Packages policies
CREATE POLICY "Authenticated users can view packages"
  ON packages FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create packages"
  ON packages FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update packages"
  ON packages FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete packages"
  ON packages FOR DELETE
  TO authenticated
  USING (true);

-- Package items policies
CREATE POLICY "Authenticated users can view package items"
  ON package_items FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create package items"
  ON package_items FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update package items"
  ON package_items FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete package items"
  ON package_items FOR DELETE
  TO authenticated
  USING (true);

-- =====================================================
-- 8. GRANTS
-- =====================================================

GRANT SELECT ON package_categories TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON package_categories TO authenticated;

GRANT SELECT ON packages TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON packages TO authenticated;

GRANT SELECT ON package_items TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON package_items TO authenticated;

GRANT SELECT ON v_packages_summary TO anon, authenticated;

-- =====================================================
-- 9. SEED DATA - Example packages
-- =====================================================

-- Create example packages
DO $$
DECLARE
  v_stik_cat_id UUID;
  v_belysning_cat_id UUID;
  v_pkg_stik_id UUID;
  v_pkg_spot_id UUID;
  v_stik_comp_id UUID;
  v_spot_comp_id UUID;
BEGIN
  -- Get category IDs
  SELECT id INTO v_stik_cat_id FROM package_categories WHERE slug = 'outlets';
  SELECT id INTO v_belysning_cat_id FROM package_categories WHERE slug = 'lighting';

  -- Get component IDs
  SELECT id INTO v_stik_comp_id FROM calc_components WHERE code = 'STIK-STD';
  SELECT id INTO v_spot_comp_id FROM calc_components WHERE code = 'SPOT-STD';

  -- Package 1: Stikkontakt installation (standard)
  INSERT INTO packages (name, code, description, category_id, default_markup_percentage)
  VALUES (
    'Stikkontakt installation',
    'PKG-STIK-001',
    'Komplet installation af stikkontakt inkl. materialer',
    v_stik_cat_id,
    25
  ) RETURNING id INTO v_pkg_stik_id;

  -- Add items to stikkontakt package
  INSERT INTO package_items (package_id, item_type, component_id, component_variant_code, description, quantity, unit, cost_price, sale_price, sort_order) VALUES
    (v_pkg_stik_id, 'component', v_stik_comp_id, 'GIPS', 'Stikkontakt - Gips installation', 1, 'stk', 45, 150, 1),
    (v_pkg_stik_id, 'manual', NULL, NULL, 'Stikkontakt dobbelt', 1, 'stk', 35, 65, 2),
    (v_pkg_stik_id, 'manual', NULL, NULL, 'Kabel 3G2.5', 5, 'm', 8, 15, 3),
    (v_pkg_stik_id, 'manual', NULL, NULL, 'Samledåse', 1, 'stk', 12, 25, 4),
    (v_pkg_stik_id, 'time', NULL, NULL, 'Arbejdsløn', 0.5, 'timer', 0, 450, 5);

  -- Package 2: Spot belysning (3 stk)
  INSERT INTO packages (name, code, description, category_id, default_markup_percentage)
  VALUES (
    'Spot belysning 3 stk',
    'PKG-SPOT-003',
    '3 spots med installation i gipsloft',
    v_belysning_cat_id,
    25
  ) RETURNING id INTO v_pkg_spot_id;

  -- Add items to spot package
  INSERT INTO package_items (package_id, item_type, component_id, component_variant_code, description, quantity, unit, cost_price, sale_price, sort_order) VALUES
    (v_pkg_spot_id, 'component', v_spot_comp_id, 'GIPS', 'Spot indbygning - Gips', 3, 'stk', 25, 85, 1),
    (v_pkg_spot_id, 'manual', NULL, NULL, 'LED spot GU10 5W', 3, 'stk', 45, 95, 2),
    (v_pkg_spot_id, 'manual', NULL, NULL, 'Spotring hvid', 3, 'stk', 15, 35, 3),
    (v_pkg_spot_id, 'manual', NULL, NULL, 'Kabel 2x0.75', 8, 'm', 4, 12, 4),
    (v_pkg_spot_id, 'time', NULL, NULL, 'Arbejdsløn', 1.5, 'timer', 0, 450, 5);

END $$;
