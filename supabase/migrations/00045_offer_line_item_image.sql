-- =====================================================
-- 00045: Add image_url to offer_line_items
-- Allows storing product images on offer lines
-- =====================================================

ALTER TABLE offer_line_items
  ADD COLUMN IF NOT EXISTS image_url TEXT;
