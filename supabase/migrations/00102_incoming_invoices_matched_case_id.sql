-- =====================================================
-- Migration 00102: Sprint 5E-1 — incoming_invoices.matched_case_id
--
-- Adds a canonical sag-link to incoming_invoices so a leverandørfaktura
-- can be tied directly to a service_case (sag) — not just to a single
-- work_order via matched_work_order_id.
--
-- Why:
--   - service_cases is the canonical sag (post-Sprint 2/3).
--   - One sag can have 0..N work_orders. The existing
--     matched_work_order_id always picks one WO via address fallback,
--     which is wrong when the wrong WO is picked.
--   - matched_case_id makes the sag-link explicit and survives even
--     when no WO exists yet on the sag (case_number-direct match).
--
-- Backward-compat:
--   - matched_work_order_id is KEPT. Phase 15 code (matcher,
--     approve, e-conomic push) continues to work unchanged.
--   - The matcher will (in 5E-1 commit 2) fill BOTH columns when it
--     can resolve a WO (matched_case_id = work_order.case_id) and
--     ONLY matched_case_id when the case is resolved directly via
--     case_number / address but no WO is selectable.
--   - From 5E onward, the case is the styrende key for sag-economy;
--     WO is informational only.
--
-- ALL ADDITIVE — no DROP, no ALTER on existing columns, no rename,
-- no destructive change to indexes. Idempotent.
-- =====================================================

ALTER TABLE incoming_invoices
  ADD COLUMN IF NOT EXISTS matched_case_id UUID
    REFERENCES service_cases(id) ON DELETE SET NULL;

-- Lookup index for "show me all leverandørfakturaer on case X"
-- (Sprint 5E-4 economy tab + future case detail view).
-- Partial — only populated rows are useful, keeps the index small
-- while incoming_invoices is mostly NULL on this column.
CREATE INDEX IF NOT EXISTS idx_incoming_invoices_case
  ON incoming_invoices(matched_case_id)
  WHERE matched_case_id IS NOT NULL;

-- Operational queue: "approved leverandørfakturaer on a sag" — picked
-- up by Sprint 5E-4 quality-flag query for unconverted lines.
-- Partial keeps it tiny.
CREATE INDEX IF NOT EXISTS idx_incoming_invoices_case_approved
  ON incoming_invoices(matched_case_id, created_at DESC)
  WHERE matched_case_id IS NOT NULL AND status = 'approved';
