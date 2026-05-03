-- =====================================================
-- Migration 00098: Sprint 2 — Step 1
-- Extend service_cases with project-style fields so it can serve as
-- the canonical "sag/ordre" in the new ERP model.
--
-- Per SPRINT_2A_ARCHITECTURE_DECISION.md (Option A modified):
--   - service_cases stays as canonical SAG/ORDRE
--   - work_orders stays as DAY-LEVEL EXECUTION SLOT child of a sag
--   - projects is NOT touched in this migration (drop deferred to a
--     later step, only after /dashboard/orders is built and stable)
--
-- ALL ADDITIONS ARE ADDITIVE AND NULLABLE — no destructive changes,
-- no impact on the 1 existing row, no impact on Phase 7/8 triggers
-- on work_orders.
-- =====================================================

-- ---------- 1. Project-style fields ----------

ALTER TABLE service_cases
  -- Display + classification
  ADD COLUMN IF NOT EXISTS project_name      TEXT,
  ADD COLUMN IF NOT EXISTS type              TEXT,
  -- External + customer references (PO-nummer, rekvirent etc.)
  ADD COLUMN IF NOT EXISTS reference         TEXT,
  ADD COLUMN IF NOT EXISTS requisition       TEXT,
  -- People responsible for execution
  ADD COLUMN IF NOT EXISTS formand_id        UUID REFERENCES employees(id) ON DELETE SET NULL,
  -- Planning + economics
  ADD COLUMN IF NOT EXISTS planned_hours     NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS contract_sum      NUMERIC(12,2),     -- tilbudt beløb (offer-anchored)
  ADD COLUMN IF NOT EXISTS revised_sum       NUMERIC(12,2),     -- revideret beløb after change-orders
  ADD COLUMN IF NOT EXISTS budget            NUMERIC(12,2),     -- internal cost budget
  ADD COLUMN IF NOT EXISTS start_date        DATE,
  ADD COLUMN IF NOT EXISTS end_date          DATE,
  -- Workflow flags (mirror Phase 7/8 work_orders flags so the same
  -- logic can later live on the sag instead of the WO)
  ADD COLUMN IF NOT EXISTS auto_invoice_on_done BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS low_profit        BOOLEAN NOT NULL DEFAULT false,
  -- Optional link to the offer that produced this sag (mirrors
  -- work_orders.source_offer_id pattern)
  ADD COLUMN IF NOT EXISTS source_offer_id   UUID REFERENCES offers(id) ON DELETE SET NULL;

-- ---------- 2. Constrain `type` enum (additive CHECK) ----------
-- A new CHECK that allows NULL (existing rows, including the 1 prod
-- row, currently have NULL → satisfied) and the canonical Elta job
-- types. Easy to extend later.

ALTER TABLE service_cases DROP CONSTRAINT IF EXISTS service_cases_type_check;
ALTER TABLE service_cases
  ADD CONSTRAINT service_cases_type_check
  CHECK (type IS NULL OR type IN (
    'solar',         -- solcelleanlæg
    'service',       -- servicebesøg
    'installation',  -- el-installation
    'project',       -- større projekt / entreprise
    'akut',          -- akut udkald
    'general'        -- fallback
  ));

-- ---------- 3. Indexes for the new lookups ----------

CREATE INDEX IF NOT EXISTS idx_service_cases_type
  ON service_cases(type) WHERE type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_service_cases_formand
  ON service_cases(formand_id) WHERE formand_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_service_cases_source_offer
  ON service_cases(source_offer_id) WHERE source_offer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_service_cases_low_profit
  ON service_cases(low_profit) WHERE low_profit = true;

CREATE INDEX IF NOT EXISTS idx_service_cases_scheduled
  ON service_cases(start_date, end_date)
  WHERE start_date IS NOT NULL OR end_date IS NOT NULL;
