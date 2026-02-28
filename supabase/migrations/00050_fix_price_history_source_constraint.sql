-- =====================================================
-- MIGRATION 00050: Fix price_history change_source constraint
-- Description: Add 'email_detection' to allowed change_source values
--              Required by email-ao-detector.ts (Mail Bridge)
-- =====================================================

-- Drop the existing CHECK constraint
ALTER TABLE price_history DROP CONSTRAINT IF EXISTS price_history_change_source_check;

-- Re-create with the additional 'email_detection' value
ALTER TABLE price_history ADD CONSTRAINT price_history_change_source_check
  CHECK (change_source IN ('import', 'manual', 'api_sync', 'email_detection'));
