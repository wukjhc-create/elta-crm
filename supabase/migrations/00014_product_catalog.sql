-- =====================================================
-- 00014_product_catalog.sql
-- Product Catalog, Suppliers, and Calculations System
-- =====================================================

-- =====================================================
-- 1. SUPPLIERS TABLE
-- =====================================================

CREATE TABLE suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT UNIQUE,  -- 'AO', 'LEMVIG', 'SOLAR_DK'
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  website TEXT,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for common queries
CREATE INDEX idx_suppliers_name ON suppliers(name);
CREATE INDEX idx_suppliers_code ON suppliers(code);
CREATE INDEX idx_suppliers_is_active ON suppliers(is_active);

-- Trigger for updated_at
CREATE TRIGGER update_suppliers_updated_at
  BEFORE UPDATE ON suppliers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 2. PRODUCT CATEGORIES TABLE
-- =====================================================

CREATE TABLE product_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,  -- 'panels', 'inverters', etc.
  parent_id UUID REFERENCES product_categories(id) ON DELETE SET NULL,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for parent-child queries
CREATE INDEX idx_product_categories_parent_id ON product_categories(parent_id);
CREATE INDEX idx_product_categories_slug ON product_categories(slug);
CREATE INDEX idx_product_categories_sort_order ON product_categories(sort_order);

-- Insert default categories
INSERT INTO product_categories (name, slug, sort_order) VALUES
  ('Solpaneler', 'panels', 1),
  ('Invertere', 'inverters', 2),
  ('Batterier', 'batteries', 3),
  ('Montering', 'mounting', 4),
  ('Kabler', 'cables', 5),
  ('Tilbehor', 'accessories', 6),
  ('Arbejdslon', 'labor', 7);

-- =====================================================
-- 3. PRODUCT CATALOG TABLE
-- =====================================================

CREATE TABLE product_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  category_id UUID REFERENCES product_categories(id) ON DELETE SET NULL,
  cost_price DECIMAL(12, 2),
  list_price DECIMAL(12, 2) NOT NULL,
  unit TEXT DEFAULT 'stk',
  specifications JSONB DEFAULT '{}',
  -- Example: { "wattage": 400, "efficiency": 0.20, "dimensions": "1755x1038x35mm" }
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_product_catalog_sku ON product_catalog(sku);
CREATE INDEX idx_product_catalog_name ON product_catalog(name);
CREATE INDEX idx_product_catalog_category_id ON product_catalog(category_id);
CREATE INDEX idx_product_catalog_is_active ON product_catalog(is_active);

-- Trigger for updated_at
CREATE TRIGGER update_product_catalog_updated_at
  BEFORE UPDATE ON product_catalog
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 4. SUPPLIER PRODUCTS TABLE
-- =====================================================

CREATE TABLE supplier_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  product_id UUID REFERENCES product_catalog(id) ON DELETE SET NULL,  -- Optional link
  supplier_sku TEXT NOT NULL,
  supplier_name TEXT NOT NULL,
  cost_price DECIMAL(12, 2),
  is_available BOOLEAN DEFAULT true,
  lead_time_days INTEGER,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(supplier_id, supplier_sku)
);

-- Indexes for common queries
CREATE INDEX idx_supplier_products_supplier_id ON supplier_products(supplier_id);
CREATE INDEX idx_supplier_products_product_id ON supplier_products(product_id);
CREATE INDEX idx_supplier_products_supplier_sku ON supplier_products(supplier_sku);
CREATE INDEX idx_supplier_products_is_available ON supplier_products(is_available);

-- Trigger for updated_at
CREATE TRIGGER update_supplier_products_updated_at
  BEFORE UPDATE ON supplier_products
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 5. CALCULATIONS TABLE
-- =====================================================

-- Enum for calculation types
CREATE TYPE calculation_type AS ENUM ('solar_system', 'electrical', 'custom');

CREATE TABLE calculations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  calculation_type calculation_type DEFAULT 'custom',
  settings JSONB DEFAULT '{}',
  -- For solar: { "systemSize": 10, "panelCount": 25, "inverterType": "string" }
  subtotal DECIMAL(12, 2) DEFAULT 0,
  margin_percentage DECIMAL(5, 2) DEFAULT 0,
  margin_amount DECIMAL(12, 2) DEFAULT 0,
  discount_percentage DECIMAL(5, 2) DEFAULT 0,
  discount_amount DECIMAL(12, 2) DEFAULT 0,
  tax_percentage DECIMAL(5, 2) DEFAULT 25.0,
  tax_amount DECIMAL(12, 2) DEFAULT 0,
  final_amount DECIMAL(12, 2) DEFAULT 0,
  roi_data JSONB,
  -- For solar: { "paybackYears": 8, "annualSavings": 12000, "totalSavings": 240000 }
  is_template BOOLEAN DEFAULT false,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_calculations_customer_id ON calculations(customer_id);
CREATE INDEX idx_calculations_calculation_type ON calculations(calculation_type);
CREATE INDEX idx_calculations_is_template ON calculations(is_template);
CREATE INDEX idx_calculations_created_by ON calculations(created_by);
CREATE INDEX idx_calculations_created_at ON calculations(created_at);

-- Trigger for updated_at
CREATE TRIGGER update_calculations_updated_at
  BEFORE UPDATE ON calculations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 6. CALCULATION ROWS TABLE
-- =====================================================

-- Enum for row types
CREATE TYPE calculation_row_type AS ENUM ('manual', 'product', 'supplier_product', 'section');

CREATE TABLE calculation_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calculation_id UUID NOT NULL REFERENCES calculations(id) ON DELETE CASCADE,
  row_type calculation_row_type NOT NULL DEFAULT 'manual',
  product_id UUID REFERENCES product_catalog(id) ON DELETE SET NULL,
  supplier_product_id UUID REFERENCES supplier_products(id) ON DELETE SET NULL,
  section TEXT,  -- 'Materialer', 'Arbejdslon', etc.
  position INTEGER NOT NULL,
  description TEXT NOT NULL,
  quantity DECIMAL(10, 2) NOT NULL DEFAULT 1,
  unit TEXT DEFAULT 'stk',
  cost_price DECIMAL(12, 2),
  sale_price DECIMAL(12, 2) NOT NULL,
  margin_percentage DECIMAL(5, 2) DEFAULT 0,
  discount_percentage DECIMAL(5, 2) DEFAULT 0,
  total DECIMAL(12, 2) NOT NULL,
  show_on_offer BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_calculation_rows_calculation_id ON calculation_rows(calculation_id);
CREATE INDEX idx_calculation_rows_product_id ON calculation_rows(product_id);
CREATE INDEX idx_calculation_rows_supplier_product_id ON calculation_rows(supplier_product_id);
CREATE INDEX idx_calculation_rows_position ON calculation_rows(position);
CREATE INDEX idx_calculation_rows_section ON calculation_rows(section);

-- Trigger for updated_at
CREATE TRIGGER update_calculation_rows_updated_at
  BEFORE UPDATE ON calculation_rows
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 7. ENHANCE OFFER_LINE_ITEMS TABLE
-- =====================================================

ALTER TABLE offer_line_items
  ADD COLUMN IF NOT EXISTS line_type TEXT DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES product_catalog(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS calculation_id UUID REFERENCES calculations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS section TEXT,
  ADD COLUMN IF NOT EXISTS cost_price DECIMAL(12, 2),
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- Indexes for new columns
CREATE INDEX IF NOT EXISTS idx_offer_line_items_line_type ON offer_line_items(line_type);
CREATE INDEX IF NOT EXISTS idx_offer_line_items_product_id ON offer_line_items(product_id);
CREATE INDEX IF NOT EXISTS idx_offer_line_items_calculation_id ON offer_line_items(calculation_id);
CREATE INDEX IF NOT EXISTS idx_offer_line_items_section ON offer_line_items(section);

-- =====================================================
-- 8. TRIGGER FUNCTIONS
-- =====================================================

-- Function to calculate row total
CREATE OR REPLACE FUNCTION calculate_calculation_row_total()
RETURNS TRIGGER AS $$
BEGIN
  -- Calculate total: quantity * sale_price * (1 - discount/100)
  NEW.total := NEW.quantity * NEW.sale_price * (1 - COALESCE(NEW.discount_percentage, 0) / 100);

  -- Calculate margin if cost_price is set
  IF NEW.cost_price IS NOT NULL AND NEW.cost_price > 0 THEN
    NEW.margin_percentage := ((NEW.sale_price - NEW.cost_price) / NEW.cost_price) * 100;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-calculate row total
CREATE TRIGGER trigger_calculate_row_total
  BEFORE INSERT OR UPDATE ON calculation_rows
  FOR EACH ROW
  EXECUTE FUNCTION calculate_calculation_row_total();

-- Function to update calculation totals when rows change
CREATE OR REPLACE FUNCTION update_calculation_totals()
RETURNS TRIGGER AS $$
DECLARE
  calc_id UUID;
  new_subtotal DECIMAL(12, 2);
  new_margin_amount DECIMAL(12, 2);
  new_discount_amount DECIMAL(12, 2);
  new_tax_amount DECIMAL(12, 2);
  new_final_amount DECIMAL(12, 2);
  calc_record RECORD;
BEGIN
  -- Get calculation ID
  IF TG_OP = 'DELETE' THEN
    calc_id := OLD.calculation_id;
  ELSE
    calc_id := NEW.calculation_id;
  END IF;

  -- Get current calculation settings
  SELECT margin_percentage, discount_percentage, tax_percentage
  INTO calc_record
  FROM calculations
  WHERE id = calc_id;

  -- Calculate new subtotal from all rows
  SELECT COALESCE(SUM(total), 0) INTO new_subtotal
  FROM calculation_rows
  WHERE calculation_id = calc_id;

  -- Calculate margin amount (on subtotal)
  new_margin_amount := new_subtotal * COALESCE(calc_record.margin_percentage, 0) / 100;

  -- Amount after margin
  new_subtotal := new_subtotal + new_margin_amount;

  -- Calculate discount amount
  new_discount_amount := new_subtotal * COALESCE(calc_record.discount_percentage, 0) / 100;

  -- Amount after discount
  new_subtotal := new_subtotal - new_discount_amount;

  -- Calculate tax amount
  new_tax_amount := new_subtotal * COALESCE(calc_record.tax_percentage, 25) / 100;

  -- Final amount including tax
  new_final_amount := new_subtotal + new_tax_amount;

  -- Update calculation
  UPDATE calculations
  SET
    subtotal = (SELECT COALESCE(SUM(total), 0) FROM calculation_rows WHERE calculation_id = calc_id),
    margin_amount = new_margin_amount,
    discount_amount = new_discount_amount,
    tax_amount = new_tax_amount,
    final_amount = new_final_amount,
    updated_at = NOW()
  WHERE id = calc_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update calculation totals
CREATE TRIGGER trigger_update_calculation_totals
  AFTER INSERT OR UPDATE OR DELETE ON calculation_rows
  FOR EACH ROW
  EXECUTE FUNCTION update_calculation_totals();

-- =====================================================
-- 9. RLS POLICIES
-- =====================================================

-- Enable RLS on all new tables
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE calculations ENABLE ROW LEVEL SECURITY;
ALTER TABLE calculation_rows ENABLE ROW LEVEL SECURITY;

-- Suppliers policies
CREATE POLICY "Authenticated users can view suppliers"
  ON suppliers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create suppliers"
  ON suppliers FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update suppliers"
  ON suppliers FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete suppliers"
  ON suppliers FOR DELETE
  TO authenticated
  USING (true);

-- Product categories policies
CREATE POLICY "Anyone can view product categories"
  ON product_categories FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "Authenticated users can create product categories"
  ON product_categories FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update product categories"
  ON product_categories FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete product categories"
  ON product_categories FOR DELETE
  TO authenticated
  USING (true);

-- Product catalog policies
CREATE POLICY "Anyone can view products"
  ON product_catalog FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "Authenticated users can create products"
  ON product_catalog FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update products"
  ON product_catalog FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete products"
  ON product_catalog FOR DELETE
  TO authenticated
  USING (true);

-- Supplier products policies
CREATE POLICY "Authenticated users can view supplier products"
  ON supplier_products FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create supplier products"
  ON supplier_products FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update supplier products"
  ON supplier_products FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete supplier products"
  ON supplier_products FOR DELETE
  TO authenticated
  USING (true);

-- Calculations policies
CREATE POLICY "Users can view own calculations"
  ON calculations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can create calculations"
  ON calculations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update own calculations"
  ON calculations FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Users can delete own calculations"
  ON calculations FOR DELETE
  TO authenticated
  USING (true);

-- Calculation rows policies
CREATE POLICY "Users can view calculation rows"
  ON calculation_rows FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can create calculation rows"
  ON calculation_rows FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update calculation rows"
  ON calculation_rows FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Users can delete calculation rows"
  ON calculation_rows FOR DELETE
  TO authenticated
  USING (true);

-- =====================================================
-- 10. GRANTS
-- =====================================================

GRANT SELECT ON suppliers TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON suppliers TO authenticated;

GRANT SELECT ON product_categories TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON product_categories TO authenticated;

GRANT SELECT ON product_catalog TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON product_catalog TO authenticated;

GRANT SELECT ON supplier_products TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON supplier_products TO authenticated;

GRANT SELECT ON calculations TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON calculations TO authenticated;

GRANT SELECT ON calculation_rows TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON calculation_rows TO authenticated;
