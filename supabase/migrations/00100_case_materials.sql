-- =====================================================
-- Migration 00100: Sprint 5B — case_materials
--
-- Canonical material consumption on a service_case (sag).
-- Distinct from offer_line_items (what was QUOTED) and from
-- incoming_invoice_lines (what was SUPPLIED). This is what was
-- actually USED on the sag.
--
-- Snapshot pricing: unit_cost + unit_sales_price are captured at
-- registration time. Later changes in supplier_products or
-- materials catalog do NOT retroactively change a sag's economics.
--
-- ALL ADDITIVE — no DROP, no ALTER on supplier_products,
-- offer_line_items, time_entries, or any other existing table.
-- =====================================================

CREATE TABLE IF NOT EXISTS case_materials (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Canonical sag link (cascade — deleting a sag clears its bookings)
  case_id                  UUID NOT NULL
                           REFERENCES service_cases(id) ON DELETE CASCADE,

  -- Optional secondary links — preserved if the parent row goes away
  work_order_id            UUID
                           REFERENCES work_orders(id) ON DELETE SET NULL,
  supplier_product_id      UUID
                           REFERENCES supplier_products(id) ON DELETE SET NULL,
  material_id              UUID
                           REFERENCES materials(id) ON DELETE SET NULL,

  -- Snapshot identification (so the row reads correctly even if
  -- the supplier_product is renamed/removed later)
  description              TEXT NOT NULL,
  sku_snapshot             TEXT,
  supplier_name_snapshot   TEXT,
  unit                     TEXT NOT NULL DEFAULT 'stk',

  quantity                 NUMERIC(12,3) NOT NULL CHECK (quantity > 0),

  -- Snapshot prices at registration time
  unit_cost                NUMERIC(12,2) NOT NULL DEFAULT 0,
  unit_sales_price         NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- Auto-calculated stored generated columns (Postgres 12+)
  total_cost               NUMERIC(14,2)
                           GENERATED ALWAYS AS (quantity * unit_cost) STORED,
  total_sales_price        NUMERIC(14,2)
                           GENERATED ALWAYS AS (quantity * unit_sales_price) STORED,

  -- Provenance — where did this booking come from?
  source                   TEXT NOT NULL DEFAULT 'manual'
                           CHECK (source IN (
                             'manual',           -- bookt af operatør
                             'offer',            -- hentet fra tilbuddets linje
                             'supplier_invoice', -- auto-indsat fra leverandørfaktura (Sprint 5E)
                             'calculator'        -- fra Kalkia (fremtid)
                           )),
  source_offer_line_id            UUID
                                  REFERENCES offer_line_items(id) ON DELETE SET NULL,
  source_incoming_invoice_line_id UUID
                                  REFERENCES incoming_invoice_lines(id) ON DELETE SET NULL,

  -- Faktureringskobling (sat når linjen er faktureret)
  billable                 BOOLEAN NOT NULL DEFAULT true,
  invoice_line_id          UUID
                           REFERENCES invoice_lines(id) ON DELETE SET NULL,

  notes                    TEXT,

  created_by               UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- Indexes ----------
CREATE INDEX IF NOT EXISTS idx_case_materials_case
  ON case_materials(case_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_case_materials_work_order
  ON case_materials(work_order_id) WHERE work_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_case_materials_supplier_product
  ON case_materials(supplier_product_id) WHERE supplier_product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_case_materials_material
  ON case_materials(material_id) WHERE material_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_case_materials_unbilled
  ON case_materials(case_id)
  WHERE billable = true AND invoice_line_id IS NULL;

-- ---------- RLS + grants (matches pattern from 00073/00086) ----------
ALTER TABLE case_materials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "case_materials_all_auth" ON case_materials;
CREATE POLICY "case_materials_all_auth"
  ON case_materials FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

GRANT ALL ON case_materials TO authenticated, service_role;

-- ---------- updated_at trigger (re-uses helper from 00080) ----------
DROP TRIGGER IF EXISTS trg_case_materials_updated_at ON case_materials;
CREATE TRIGGER trg_case_materials_updated_at
  BEFORE UPDATE ON case_materials
  FOR EACH ROW EXECUTE FUNCTION invoices_set_updated_at();
