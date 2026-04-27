-- =====================================================
-- Migration 00067: Ordrestyring Integration
-- Adds os_case_id field and 'converted' status to service_cases
-- =====================================================

-- 1. Add Ordrestyring external reference
ALTER TABLE service_cases ADD COLUMN IF NOT EXISTS os_case_id TEXT;
ALTER TABLE service_cases ADD COLUMN IF NOT EXISTS os_synced_at TIMESTAMPTZ;

-- 2. Update status CHECK to allow 'converted'
-- Drop old check and recreate with new value
ALTER TABLE service_cases DROP CONSTRAINT IF EXISTS service_cases_status_check;
ALTER TABLE service_cases ADD CONSTRAINT service_cases_status_check
  CHECK (status IN ('new', 'in_progress', 'pending', 'closed', 'converted'));

-- 3. Index for Ordrestyring reference
CREATE INDEX IF NOT EXISTS idx_service_cases_os_case_id ON service_cases(os_case_id)
  WHERE os_case_id IS NOT NULL;
