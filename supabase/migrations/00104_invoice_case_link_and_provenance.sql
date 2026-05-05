-- =====================================================
-- Migration 00104: Sprint 6B-1 — invoice case-link +
-- invoice_lines provenance to time_logs / case_materials /
-- case_other_costs.
--
-- Two layers, both additive:
--
--  1. invoices.case_id — direct FK to the canonical sag
--     (mirrors what we already do for incoming_invoices via
--      mig 00102's matched_case_id).
--
--  2. invoice_lines.source_*_id — three FKs that say "this
--     fakturalinje was generated from THIS time_log /
--     case_material / case_other_cost". The UNIQUE PARTIAL
--     indexes turn each FK into an at-most-once guard, which
--     is what prevents double billing of the same source row.
--
-- ALL ADDITIVE — no DROP, no ALTER on existing columns, no
-- rename, no destructive change. Idempotent.
-- =====================================================

-- ---------- 1. invoices.case_id ----------
-- Direct sag-link. Existing flows use invoices.work_order_id
-- (Phase 7.1) and invoices.offer_id (Phase 5) — both bevares.
-- case_id is independent of either: an invoice can hang on a
-- sag without a specific WO (e.g. forskudsfaktura before
-- planning) or copy the WO's case_id when generated from one.

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS case_id UUID
    REFERENCES service_cases(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_case_id
  ON invoices(case_id)
  WHERE case_id IS NOT NULL;

-- ---------- 2. invoice_lines provenance ----------
-- Three optional FKs identifying the canonical source of a
-- line. Exactly one will typically be set (or none, for
-- manual/free-text lines). The UNIQUE PARTIAL indexes below
-- enforce that any single source row is referenced by at most
-- one invoice_line — that is the double-billing guard.

ALTER TABLE invoice_lines
  ADD COLUMN IF NOT EXISTS source_time_log_id UUID
    REFERENCES time_logs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_case_material_id UUID
    REFERENCES case_materials(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_case_other_cost_id UUID
    REFERENCES case_other_costs(id) ON DELETE SET NULL;

-- ---------- 3. UNIQUE PARTIAL indexes (idempotency) ----------
-- Partial WHERE NOT NULL keeps the index tiny and lets the
-- field stay NULL for manual lines. The DB itself rejects
-- a second invoice_line that points at the same time_log /
-- case_material / case_other_cost.

CREATE UNIQUE INDEX IF NOT EXISTS uq_invoice_lines_source_time_log
  ON invoice_lines(source_time_log_id)
  WHERE source_time_log_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_invoice_lines_source_case_material
  ON invoice_lines(source_case_material_id)
  WHERE source_case_material_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_invoice_lines_source_case_other_cost
  ON invoice_lines(source_case_other_cost_id)
  WHERE source_case_other_cost_id IS NOT NULL;
