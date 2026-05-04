-- =====================================================
-- Migration 00101: Sprint 5C — case_other_costs
--
-- Canonical "other costs" on a service_case (sag).
-- Distinct from case_materials (parts) and time_logs (labour).
-- This is everything else: kørsel, lift, kran, parkering,
-- underleverandør, fragt, gebyr, andet.
--
-- Snapshot pricing — same model as case_materials (Sprint 5B):
-- unit_cost + unit_sales_price are captured at registration time.
-- Later catalog/contract changes do NOT retroactively change a sag's
-- economics.
--
-- ALL ADDITIVE — no DROP, no ALTER on supplier_products,
-- offer_line_items, time_entries, incoming_invoices, or any other
-- existing table.
-- =====================================================

CREATE TABLE IF NOT EXISTS case_other_costs (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Canonical sag link (cascade)
  case_id                  UUID NOT NULL
                           REFERENCES service_cases(id) ON DELETE CASCADE,

  -- Optional secondary link
  work_order_id            UUID
                           REFERENCES work_orders(id) ON DELETE SET NULL,

  -- Category (Henrik's spec — ASCII-safe slugs in CHECK; UI shows Danish labels)
  category                 TEXT NOT NULL
                           CHECK (category IN (
                             'koersel',         -- kørsel
                             'lift',            -- leje af lift
                             'kran',            -- leje af kran
                             'parkering',       -- parkering
                             'underleverandoer',-- underleverandør
                             'fragt',           -- fragt
                             'gebyr',           -- gebyr
                             'andet'            -- andet manuelt
                           )),

  -- Snapshot identification
  description              TEXT NOT NULL,
  supplier_name            TEXT,
  cost_date                DATE NOT NULL DEFAULT CURRENT_DATE,
  unit                     TEXT NOT NULL DEFAULT 'stk',

  quantity                 NUMERIC(12,3) NOT NULL DEFAULT 1
                           CHECK (quantity > 0),

  -- Snapshot prices at registration time
  unit_cost                NUMERIC(12,2) NOT NULL DEFAULT 0,
  unit_sales_price         NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- Auto-calculated stored generated columns
  total_cost               NUMERIC(14,2)
                           GENERATED ALWAYS AS (quantity * unit_cost) STORED,
  total_sales_price        NUMERIC(14,2)
                           GENERATED ALWAYS AS (quantity * unit_sales_price) STORED,

  -- Receipt / bilag (upload UI added in a later sprint)
  receipt_url              TEXT,
  receipt_filename         TEXT,

  -- Provenance
  source                   TEXT NOT NULL DEFAULT 'manual'
                           CHECK (source IN (
                             'manual',           -- bookt af operatør
                             'time_log',         -- afledt af time_log (fx kørsel pr. timelog) — fremtid
                             'supplier_invoice'  -- fra leverandørfaktura — Sprint 5E
                           )),

  -- Faktureringskobling
  billable                 BOOLEAN NOT NULL DEFAULT true,
  invoice_line_id          UUID
                           REFERENCES invoice_lines(id) ON DELETE SET NULL,

  notes                    TEXT,

  created_by               UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- Indexes ----------
CREATE INDEX IF NOT EXISTS idx_case_other_costs_case
  ON case_other_costs(case_id, cost_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_case_other_costs_work_order
  ON case_other_costs(work_order_id) WHERE work_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_case_other_costs_category
  ON case_other_costs(category);
CREATE INDEX IF NOT EXISTS idx_case_other_costs_unbilled
  ON case_other_costs(case_id)
  WHERE billable = true AND invoice_line_id IS NULL;

-- ---------- RLS + grants (matches case_materials / case_notes pattern) ----------
ALTER TABLE case_other_costs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "case_other_costs_all_auth" ON case_other_costs;
CREATE POLICY "case_other_costs_all_auth"
  ON case_other_costs FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

GRANT ALL ON case_other_costs TO authenticated, service_role;

-- ---------- updated_at trigger ----------
DROP TRIGGER IF EXISTS trg_case_other_costs_updated_at ON case_other_costs;
CREATE TRIGGER trg_case_other_costs_updated_at
  BEFORE UPDATE ON case_other_costs
  FOR EACH ROW EXECUTE FUNCTION invoices_set_updated_at();
