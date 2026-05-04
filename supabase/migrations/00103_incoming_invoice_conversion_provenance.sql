-- =====================================================
-- Migration 00103: Sprint 5E-3 — conversion provenance
--
-- Wires up bidirectional links so we can convert
-- incoming_invoice_lines → case_materials / case_other_costs
-- safely, idempotently, and reversibly.
--
-- case_materials already has source_incoming_invoice_line_id from
-- migration 00100 (Sprint 5B). case_other_costs needs the mirror.
--
-- incoming_invoice_lines gets reverse-link columns so we can mark
-- "this line was converted to <X>" — drives:
--   - the "Allerede konverteret" UI state
--   - the idempotency guard (UNIQUE partial indexes below)
--   - audit / quality flags on Økonomi-tab
--
-- ALL ADDITIVE. No DROP, no ALTER on existing columns, no rename, no
-- destructive change. Idempotent.
-- =====================================================

-- ---------- 1. case_other_costs.source_incoming_invoice_line_id ----------
-- Mirror of the existing case_materials.source_incoming_invoice_line_id
-- (added in migration 00100). Lets us join an øvrige-omkostnings-linje
-- back to the supplier-invoice line that produced it.

ALTER TABLE case_other_costs
  ADD COLUMN IF NOT EXISTS source_incoming_invoice_line_id UUID
    REFERENCES incoming_invoice_lines(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_case_other_costs_source_iil
  ON case_other_costs(source_incoming_invoice_line_id)
  WHERE source_incoming_invoice_line_id IS NOT NULL;

-- ---------- 2. incoming_invoice_lines reverse links ----------
-- A line can be converted to AT MOST one downstream row. The unique
-- partial indexes enforce this — they ignore NULLs so unconverted
-- lines stay free.

ALTER TABLE incoming_invoice_lines
  ADD COLUMN IF NOT EXISTS converted_case_material_id UUID
    REFERENCES case_materials(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS converted_case_other_cost_id UUID
    REFERENCES case_other_costs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS converted_by UUID
    REFERENCES profiles(id) ON DELETE SET NULL;

-- ---------- 3. Idempotency: one line → one downstream row ----------
-- We don't enforce "exactly one of the two FKs" — both can be NULL
-- (line skipped or unconverted) but each FK must be unique when set.

CREATE UNIQUE INDEX IF NOT EXISTS uq_iil_converted_case_material
  ON incoming_invoice_lines(converted_case_material_id)
  WHERE converted_case_material_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_iil_converted_case_other_cost
  ON incoming_invoice_lines(converted_case_other_cost_id)
  WHERE converted_case_other_cost_id IS NOT NULL;

-- ---------- 4. Lookup: lines awaiting conversion per invoice ----------
-- Drives the "X ukonverterede linjer" badge on the Økonomi-tab.

CREATE INDEX IF NOT EXISTS idx_iil_unconverted_per_invoice
  ON incoming_invoice_lines(incoming_invoice_id)
  WHERE converted_case_material_id IS NULL
    AND converted_case_other_cost_id IS NULL
    AND converted_at IS NULL;
