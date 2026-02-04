-- =====================================================
-- 00042_supplier_integration_fix.sql
-- Fix for supplier integration view column conflict
-- =====================================================

-- Drop and recreate the view with fixed column names
DROP VIEW IF EXISTS v_supplier_products_with_supplier;

CREATE VIEW v_supplier_products_with_supplier AS
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
-- VIEW: Import Batches Summary (if not created)
-- =====================================================

DROP VIEW IF EXISTS v_import_batches_summary;

CREATE VIEW v_import_batches_summary AS
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
-- FUNCTION: Get Best Price for Product (if not created)
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
-- FUNCTION: Update Material Price from Supplier (if not created)
-- =====================================================

CREATE OR REPLACE FUNCTION sync_material_price_from_supplier(p_material_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_supplier_product RECORD;
  v_material RECORD;
BEGIN
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
-- GRANTS for views
-- =====================================================

GRANT SELECT ON v_supplier_products_with_supplier TO anon, authenticated;
GRANT SELECT ON v_import_batches_summary TO anon, authenticated;

-- =====================================================
-- Seed default suppliers if not exists
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
WHERE code = 'AO'
ON CONFLICT (supplier_id) DO NOTHING;

INSERT INTO supplier_settings (supplier_id, import_format, csv_delimiter, csv_encoding, default_margin_percentage)
SELECT id, 'csv', ';', 'utf-8', 25.00
FROM suppliers
WHERE code = 'LM'
ON CONFLICT (supplier_id) DO NOTHING;
