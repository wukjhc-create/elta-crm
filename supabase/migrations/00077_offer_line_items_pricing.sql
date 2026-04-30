-- =====================================================
-- Migration 00077: Pricing columns on offer_line_items
--
-- Adds explicit cost_price / margin_percentage / sale_price columns.
-- cost_price already exists but is nullable — we backfill, then enforce
-- NOT NULL DEFAULT 0.
-- =====================================================

-- 1. Ensure new columns exist with safe defaults.
ALTER TABLE offer_line_items
  ADD COLUMN IF NOT EXISTS margin_percentage NUMERIC NOT NULL DEFAULT 0;

ALTER TABLE offer_line_items
  ADD COLUMN IF NOT EXISTS sale_price NUMERIC NOT NULL DEFAULT 0;

-- 2. Backfill from existing data (only fill rows where new columns are still 0).
--    Use supplier_cost_price_at_creation if cost_price is NULL.
UPDATE offer_line_items
   SET cost_price = COALESCE(cost_price, supplier_cost_price_at_creation, 0)
 WHERE cost_price IS NULL;

UPDATE offer_line_items
   SET sale_price = COALESCE(unit_price, 0)
 WHERE sale_price = 0;

UPDATE offer_line_items
   SET margin_percentage = CASE
     WHEN supplier_margin_applied IS NOT NULL THEN supplier_margin_applied
     WHEN cost_price IS NOT NULL AND cost_price > 0 AND unit_price IS NOT NULL
       THEN ROUND(((unit_price - cost_price) / cost_price * 100)::numeric, 2)
     ELSE 0
   END
 WHERE margin_percentage = 0;

-- 3. Enforce NOT NULL DEFAULT 0 on cost_price now that it's safe.
ALTER TABLE offer_line_items
  ALTER COLUMN cost_price SET DEFAULT 0;
ALTER TABLE offer_line_items
  ALTER COLUMN cost_price SET NOT NULL;
