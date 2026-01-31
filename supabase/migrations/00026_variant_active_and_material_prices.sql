-- =====================================================
-- MIGRATION 00026: Add variant is_active and material prices
-- Description: Enable/disable variants and add cost/sale prices to materials
-- =====================================================

-- Add is_active column to variants (defaults to true)
ALTER TABLE calc_component_variants
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Add cost and sale prices to materials
ALTER TABLE calc_component_materials
ADD COLUMN IF NOT EXISTS cost_price DECIMAL(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS sale_price DECIMAL(10, 2) DEFAULT 0;

-- Add prices to variant materials as well
ALTER TABLE calc_component_variant_materials
ADD COLUMN IF NOT EXISTS cost_price DECIMAL(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS sale_price DECIMAL(10, 2) DEFAULT 0;

-- Create index for active variants filter
CREATE INDEX IF NOT EXISTS idx_calc_component_variants_is_active
ON calc_component_variants(is_active);

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
