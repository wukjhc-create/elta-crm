-- =====================================================
-- Migration: 00026_add_material_prices.sql
-- Description: Add cost_price and sale_price to calc_component_materials
-- Also add is_active to calc_component_variants
-- Date: 2026-01-31
-- =====================================================

-- Add price columns to materials table
ALTER TABLE calc_component_materials
  ADD COLUMN IF NOT EXISTS cost_price DECIMAL(10, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sale_price DECIMAL(10, 2) DEFAULT 0;

-- Add is_active to variants table for enable/disable functionality
ALTER TABLE calc_component_variants
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Add complexity_factor to components table
ALTER TABLE calc_components
  ADD COLUMN IF NOT EXISTS complexity_factor DECIMAL(4, 2) DEFAULT 1.00,
  ADD COLUMN IF NOT EXISTS default_cost_price DECIMAL(10, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS default_sale_price DECIMAL(10, 2) DEFAULT 0;

-- Create index for active variants
CREATE INDEX IF NOT EXISTS idx_calc_component_variants_is_active
  ON calc_component_variants(is_active);

-- Comment on new columns
COMMENT ON COLUMN calc_component_materials.cost_price IS 'Cost price per unit of material';
COMMENT ON COLUMN calc_component_materials.sale_price IS 'Sale price per unit of material';
COMMENT ON COLUMN calc_component_variants.is_active IS 'Whether this variant is active and selectable';
COMMENT ON COLUMN calc_components.complexity_factor IS 'Multiplier for time complexity (1.0 = normal)';
COMMENT ON COLUMN calc_components.default_cost_price IS 'Default cost price for the component';
COMMENT ON COLUMN calc_components.default_sale_price IS 'Default sale price for the component';
