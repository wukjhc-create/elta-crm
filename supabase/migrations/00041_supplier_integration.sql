-- =====================================================
-- 00041_supplier_integration.sql
-- Supplier/Wholesaler Integration (AO, Lemvigh-Müller)
-- Phase: Grossist-Integration
-- =====================================================

-- =====================================================
-- 1. SUPPLIER SETTINGS TABLE
-- Store wholesaler-specific configuration
-- =====================================================

CREATE TABLE IF NOT EXISTS supplier_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  import_format TEXT CHECK (import_format IN ('csv', 'xml', 'api')),
  csv_delimiter TEXT DEFAULT ';',
  csv_encoding TEXT DEFAULT 'utf-8',
  column_mappings JSONB DEFAULT '{}',
  -- Example: {"sku": "Varenummer", "name": "Beskrivelse", "cost_price": "Indkøbspris"}
  api_base_url TEXT,
  api_credentials JSONB,
  -- Encrypted: {"username": "...", "password": "..."}
  ftp_host TEXT,
  ftp_credentials JSONB,
  default_margin_percentage NUMERIC(5,2) DEFAULT 25.00,
  auto_update_prices BOOLEAN DEFAULT false,
  is_preferred BOOLEAN DEFAULT false,
  last_import_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(supplier_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_supplier_settings_supplier_id ON supplier_settings(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_settings_is_preferred ON supplier_settings(is_preferred);

-- Trigger for updated_at
CREATE TRIGGER update_supplier_settings_updated_at
  BEFORE UPDATE ON supplier_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 2. PRICE HISTORY TABLE
-- Track all price changes for auditing and analysis
-- =====================================================

CREATE TABLE IF NOT EXISTS price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_product_id UUID NOT NULL REFERENCES supplier_products(id) ON DELETE CASCADE,
  old_cost_price NUMERIC(12,2),
  new_cost_price NUMERIC(12,2),
  old_list_price NUMERIC(12,2),
  new_list_price NUMERIC(12,2),
  change_percentage NUMERIC(5,2),
  change_source TEXT CHECK (change_source IN ('import', 'manual', 'api_sync')),
  import_batch_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_price_history_supplier_product_id ON price_history(supplier_product_id);
CREATE INDEX IF NOT EXISTS idx_price_history_created_at ON price_history(created_at);
CREATE INDEX IF NOT EXISTS idx_price_history_import_batch_id ON price_history(import_batch_id);

-- =====================================================
-- 3. IMPORT BATCHES TABLE
-- Audit log for all imports
-- =====================================================

CREATE TABLE IF NOT EXISTS import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  filename TEXT,
  file_size_bytes INTEGER,
  total_rows INTEGER,
  processed_rows INTEGER DEFAULT 0,
  new_products INTEGER DEFAULT 0,
  updated_products INTEGER DEFAULT 0,
  skipped_rows INTEGER DEFAULT 0,
  errors JSONB DEFAULT '[]',
  status TEXT CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'dry_run')) DEFAULT 'pending',
  is_dry_run BOOLEAN DEFAULT false,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_import_batches_supplier_id ON import_batches(supplier_id);
CREATE INDEX IF NOT EXISTS idx_import_batches_status ON import_batches(status);
CREATE INDEX IF NOT EXISTS idx_import_batches_created_at ON import_batches(created_at);
CREATE INDEX IF NOT EXISTS idx_import_batches_created_by ON import_batches(created_by);

-- =====================================================
-- 4. EXTEND SUPPLIER_PRODUCTS TABLE
-- Add columns for pricing and categorization
-- =====================================================

ALTER TABLE supplier_products
  ADD COLUMN IF NOT EXISTS list_price NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS margin_percentage NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS calculated_sale_price NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS min_order_quantity INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'stk',
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS sub_category TEXT,
  ADD COLUMN IF NOT EXISTS manufacturer TEXT,
  ADD COLUMN IF NOT EXISTS ean TEXT,
  ADD COLUMN IF NOT EXISTS specifications JSONB DEFAULT '{}';

-- Additional indexes
CREATE INDEX IF NOT EXISTS idx_supplier_products_category ON supplier_products(category);
CREATE INDEX IF NOT EXISTS idx_supplier_products_manufacturer ON supplier_products(manufacturer);
CREATE INDEX IF NOT EXISTS idx_supplier_products_ean ON supplier_products(ean);

-- =====================================================
-- 5. LINK KALKIA MATERIALS TO SUPPLIER PRODUCTS
-- Connect calculation materials to supplier pricing
-- =====================================================

ALTER TABLE kalkia_variant_materials
  ADD COLUMN IF NOT EXISTS supplier_product_id UUID REFERENCES supplier_products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS auto_update_price BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_kalkia_variant_materials_supplier_product ON kalkia_variant_materials(supplier_product_id);

-- =====================================================
-- 6. VIEW: Supplier Products with Supplier Info
-- =====================================================

CREATE OR REPLACE VIEW v_supplier_products_with_supplier AS
SELECT
  sp.id,
  sp.supplier_id,
  sp.product_id,
  sp.supplier_sku,
  sp.supplier_name AS product_name,
  sp.cost_price,
  sp.list_price,
  sp.margin_percentage,
  sp.calculated_sale_price,
  sp.min_order_quantity,
  sp.unit,
  sp.category,
  sp.sub_category,
  sp.manufacturer,
  sp.ean,
  sp.specifications,
  sp.is_available,
  sp.lead_time_days,
  sp.last_synced_at,
  sp.created_at,
  sp.updated_at,
  s.name AS supplier_name,
  s.code AS supplier_code,
  s.is_active AS supplier_is_active,
  ss.default_margin_percentage,
  ss.is_preferred,
  CASE
    WHEN sp.margin_percentage IS NOT NULL THEN sp.cost_price * (1 + sp.margin_percentage / 100)
    WHEN ss.default_margin_percentage IS NOT NULL THEN sp.cost_price * (1 + ss.default_margin_percentage / 100)
    ELSE sp.cost_price * 1.25
  END AS effective_sale_price
FROM supplier_products sp
JOIN suppliers s ON sp.supplier_id = s.id
LEFT JOIN supplier_settings ss ON sp.supplier_id = ss.supplier_id;

-- =====================================================
-- 7. VIEW: Import Batches Summary
-- =====================================================

CREATE OR REPLACE VIEW v_import_batches_summary AS
SELECT
  ib.*,
  s.name AS supplier_name,
  s.code AS supplier_code,
  p.full_name AS created_by_name,
  p.email AS created_by_email
FROM import_batches ib
JOIN suppliers s ON ib.supplier_id = s.id
LEFT JOIN profiles p ON ib.created_by = p.id;

-- =====================================================
-- 8. FUNCTION: Get Best Price for Product
-- Returns the lowest cost price across all suppliers
-- =====================================================

CREATE OR REPLACE FUNCTION get_best_supplier_price(p_product_sku TEXT)
RETURNS TABLE (
  supplier_product_id UUID,
  supplier_id UUID,
  supplier_name TEXT,
  supplier_code TEXT,
  cost_price NUMERIC(12,2),
  list_price NUMERIC(12,2),
  is_preferred BOOLEAN,
  is_available BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    sp.id AS supplier_product_id,
    sp.supplier_id,
    s.name AS supplier_name,
    s.code AS supplier_code,
    sp.cost_price,
    sp.list_price,
    COALESCE(ss.is_preferred, false) AS is_preferred,
    sp.is_available
  FROM supplier_products sp
  JOIN suppliers s ON sp.supplier_id = s.id
  LEFT JOIN supplier_settings ss ON sp.supplier_id = ss.supplier_id
  WHERE sp.supplier_sku = p_product_sku
    AND sp.is_available = true
    AND s.is_active = true
  ORDER BY
    COALESCE(ss.is_preferred, false) DESC,
    sp.cost_price ASC
  LIMIT 10;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 9. FUNCTION: Update Material Price from Supplier
-- Syncs a Kalkia material price from its linked supplier product
-- =====================================================

CREATE OR REPLACE FUNCTION sync_material_price_from_supplier(p_material_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_supplier_product RECORD;
  v_material RECORD;
BEGIN
  -- Get material and linked supplier product
  SELECT m.*, sp.cost_price AS supplier_cost_price, sp.list_price AS supplier_list_price
  INTO v_material
  FROM kalkia_variant_materials m
  LEFT JOIN supplier_products sp ON m.supplier_product_id = sp.id
  WHERE m.id = p_material_id;

  IF v_material IS NULL THEN
    RETURN false;
  END IF;

  IF v_material.supplier_product_id IS NULL THEN
    RETURN false;
  END IF;

  -- Update material prices
  UPDATE kalkia_variant_materials
  SET
    cost_price = v_material.supplier_cost_price,
    sale_price = COALESCE(v_material.supplier_list_price, v_material.supplier_cost_price * 1.25),
    updated_at = now()
  WHERE id = p_material_id;

  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 10. RLS POLICIES
-- =====================================================

-- Enable RLS on new tables
ALTER TABLE supplier_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_batches ENABLE ROW LEVEL SECURITY;

-- Supplier Settings policies
CREATE POLICY "Authenticated users can view supplier settings"
  ON supplier_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create supplier settings"
  ON supplier_settings FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update supplier settings"
  ON supplier_settings FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete supplier settings"
  ON supplier_settings FOR DELETE
  TO authenticated
  USING (true);

-- Price History policies
CREATE POLICY "Authenticated users can view price history"
  ON price_history FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create price history"
  ON price_history FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Import Batches policies
CREATE POLICY "Authenticated users can view import batches"
  ON import_batches FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create import batches"
  ON import_batches FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update import batches"
  ON import_batches FOR UPDATE
  TO authenticated
  USING (true);

-- =====================================================
-- 11. GRANTS
-- =====================================================

GRANT SELECT ON supplier_settings TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON supplier_settings TO authenticated;

GRANT SELECT ON price_history TO anon, authenticated;
GRANT INSERT ON price_history TO authenticated;

GRANT SELECT ON import_batches TO anon, authenticated;
GRANT INSERT, UPDATE ON import_batches TO authenticated;

GRANT SELECT ON v_supplier_products_with_supplier TO anon, authenticated;
GRANT SELECT ON v_import_batches_summary TO anon, authenticated;

-- =====================================================
-- 12. SEED DEFAULT SUPPLIERS (AO and Lemvigh-Müller)
-- =====================================================

INSERT INTO suppliers (name, code, website, is_active, notes)
VALUES
  ('AO', 'AO', 'https://www.ao.dk', true, 'Dansk el-grossist'),
  ('Lemvigh-Müller', 'LM', 'https://www.lfrm.dk', true, 'Dansk el-grossist og teknisk handel')
ON CONFLICT (code) DO NOTHING;

-- Insert default settings for the suppliers
INSERT INTO supplier_settings (supplier_id, import_format, csv_delimiter, csv_encoding, default_margin_percentage)
SELECT id, 'csv', ';', 'iso-8859-1', 25.00
FROM suppliers
WHERE code IN ('AO', 'LM')
ON CONFLICT (supplier_id) DO NOTHING;
