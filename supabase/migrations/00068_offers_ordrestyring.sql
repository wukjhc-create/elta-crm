-- =====================================================
-- Migration 00068: Add Ordrestyring fields to offers
-- =====================================================

ALTER TABLE offers ADD COLUMN IF NOT EXISTS os_case_id TEXT;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS os_synced_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_offers_os_case_id ON offers(os_case_id)
  WHERE os_case_id IS NOT NULL;
