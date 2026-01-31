-- =====================================================
-- Migration: 00029_fix_packages_view_v2.sql
-- Description: Fix v_packages_summary view to include is_template
-- Date: 2026-01-31
-- =====================================================

-- Drop and recreate the view to add is_template column
DROP VIEW IF EXISTS v_packages_summary;

CREATE VIEW v_packages_summary AS
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
  p.is_template,
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
