-- =====================================================
-- Migration 00095: Phase 15.1 production hardening — additive only.
--
-- - parse_status: add 'needs_review' value (no new table).
-- - incoming_invoices.match_breakdown JSONB — per-signal confidence
--   scores (vat_match, name_match, work_order_match, …) so the queue
--   UI can show why a row was flagged.
-- - incoming_invoices.requires_manual_review BOOLEAN — denormalised
--   flag set when (parse_confidence + match_confidence)/2 < 0.7.
-- =====================================================

-- 1. Extend parse_status check
ALTER TABLE incoming_invoices DROP CONSTRAINT IF EXISTS incoming_invoices_parse_status_check;
ALTER TABLE incoming_invoices
  ADD CONSTRAINT incoming_invoices_parse_status_check
  CHECK (parse_status IN ('pending','parsed','failed','manual','needs_review'));

-- 2. Add per-signal confidence breakdown + review flag
ALTER TABLE incoming_invoices
  ADD COLUMN IF NOT EXISTS match_breakdown          JSONB,
  ADD COLUMN IF NOT EXISTS requires_manual_review   BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_incoming_invoices_review
  ON incoming_invoices(requires_manual_review)
  WHERE requires_manual_review = true;
