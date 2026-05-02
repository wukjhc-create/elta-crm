-- =====================================================
-- Migration 00094: Incoming supplier invoices (Phase 15)
--
-- Tables:
--   incoming_invoices         — header per supplier invoice we receive
--   incoming_invoice_lines    — extracted line items (best-effort)
--   incoming_invoice_audit_log — append-only audit per state change
-- =====================================================

CREATE TABLE IF NOT EXISTS incoming_invoices (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source: where did this invoice come from?
  source                      TEXT NOT NULL CHECK (source IN ('email','upload','manual')),
  source_email_id             UUID REFERENCES incoming_emails(id) ON DELETE SET NULL,
  uploaded_by                 UUID REFERENCES profiles(id) ON DELETE SET NULL,

  -- File/attachment metadata.
  file_url                    TEXT,
  file_name                   TEXT,
  file_size_bytes             INTEGER,
  mime_type                   TEXT,
  /* SHA-256 of the file bytes — used for hard dedup across re-imports. */
  file_hash                   TEXT,

  -- Raw text (from PDF/email body) used by the parser.
  raw_text                    TEXT,

  -- Parsed header fields (filled by incoming-invoice-parser).
  supplier_id                 UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_name_extracted     TEXT,
  supplier_vat_number         TEXT,
  invoice_number              TEXT,
  invoice_date                DATE,
  due_date                    DATE,
  currency                    TEXT NOT NULL DEFAULT 'DKK',
  amount_excl_vat             NUMERIC(12,2),
  vat_amount                  NUMERIC(12,2),
  amount_incl_vat             NUMERIC(12,2),
  payment_reference           TEXT,            -- FIK / +71 / EAN / OCR
  iban                        TEXT,

  -- Pipeline state.
  parse_status                TEXT NOT NULL DEFAULT 'pending'
                              CHECK (parse_status IN ('pending','parsed','failed','manual')),
  parse_confidence            NUMERIC(4,3),    -- 0–1

  -- Matching.
  matched_work_order_id       UUID REFERENCES work_orders(id) ON DELETE SET NULL,
  matched_purchase_order_id   UUID,            -- reserved for future PO module
  duplicate_of_id             UUID REFERENCES incoming_invoices(id) ON DELETE SET NULL,
  match_confidence            NUMERIC(4,3),

  -- Approval workflow.
  status                      TEXT NOT NULL DEFAULT 'received'
                              CHECK (status IN ('received','awaiting_approval','approved','rejected','posted','cancelled')),
  approved_by                 UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at                 TIMESTAMPTZ,
  rejected_by                 UUID REFERENCES profiles(id) ON DELETE SET NULL,
  rejected_at                 TIMESTAMPTZ,
  rejected_reason             TEXT,

  -- e-conomic linkage (when posted).
  external_invoice_id         TEXT,
  external_provider           TEXT,
  posted_at                   TIMESTAMPTZ,

  notes                       TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Dedup: same supplier + invoice_number = same invoice.
CREATE UNIQUE INDEX IF NOT EXISTS uq_incoming_invoices_supplier_number
  ON incoming_invoices(supplier_id, invoice_number)
  WHERE supplier_id IS NOT NULL AND invoice_number IS NOT NULL;

-- Hard dedup by file content hash.
CREATE UNIQUE INDEX IF NOT EXISTS uq_incoming_invoices_file_hash
  ON incoming_invoices(file_hash)
  WHERE file_hash IS NOT NULL;

-- e-conomic external id uniqueness (when set).
CREATE UNIQUE INDEX IF NOT EXISTS uq_incoming_invoices_external
  ON incoming_invoices(external_provider, external_invoice_id)
  WHERE external_invoice_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_incoming_invoices_status_time
  ON incoming_invoices(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incoming_invoices_supplier
  ON incoming_invoices(supplier_id, invoice_date DESC);
CREATE INDEX IF NOT EXISTS idx_incoming_invoices_email
  ON incoming_invoices(source_email_id) WHERE source_email_id IS NOT NULL;

-- ---------- Lines ----------
CREATE TABLE IF NOT EXISTS incoming_invoice_lines (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incoming_invoice_id   UUID NOT NULL REFERENCES incoming_invoices(id) ON DELETE CASCADE,
  line_number           INTEGER NOT NULL DEFAULT 0,
  description           TEXT,
  quantity              NUMERIC(12,2),
  unit                  TEXT,
  unit_price            NUMERIC(12,2),
  total_price           NUMERIC(12,2),
  supplier_product_id   UUID REFERENCES supplier_products(id) ON DELETE SET NULL,
  raw_line              TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incoming_invoice_lines_parent
  ON incoming_invoice_lines(incoming_invoice_id, line_number);

-- ---------- Audit log ----------
CREATE TABLE IF NOT EXISTS incoming_invoice_audit_log (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incoming_invoice_id   UUID NOT NULL REFERENCES incoming_invoices(id) ON DELETE CASCADE,
  action                TEXT NOT NULL,                -- ingested | parsed | matched | approved | rejected | posted | duplicate_detected | error
  actor_id              UUID REFERENCES profiles(id) ON DELETE SET NULL,
  previous_value        JSONB,
  new_value             JSONB,
  ok                    BOOLEAN NOT NULL DEFAULT true,
  message               TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inc_inv_audit_invoice_time
  ON incoming_invoice_audit_log(incoming_invoice_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inc_inv_audit_action_time
  ON incoming_invoice_audit_log(action, created_at DESC);

-- ---------- Suppliers external link (e-conomic supplier number) ----------
ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS external_supplier_id TEXT,
  ADD COLUMN IF NOT EXISTS external_provider    TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_suppliers_external
  ON suppliers(external_provider, external_supplier_id)
  WHERE external_supplier_id IS NOT NULL;

-- ---------- RLS + grants + triggers ----------
ALTER TABLE incoming_invoices            ENABLE ROW LEVEL SECURITY;
ALTER TABLE incoming_invoice_lines       ENABLE ROW LEVEL SECURITY;
ALTER TABLE incoming_invoice_audit_log   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "incoming_invoices_all_auth"      ON incoming_invoices;
DROP POLICY IF EXISTS "incoming_invoice_lines_all_auth" ON incoming_invoice_lines;
DROP POLICY IF EXISTS "incoming_invoice_audit_all_auth" ON incoming_invoice_audit_log;

CREATE POLICY "incoming_invoices_all_auth"
  ON incoming_invoices            FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "incoming_invoice_lines_all_auth"
  ON incoming_invoice_lines       FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "incoming_invoice_audit_all_auth"
  ON incoming_invoice_audit_log   FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON incoming_invoices            TO authenticated, service_role;
GRANT ALL ON incoming_invoice_lines       TO authenticated, service_role;
GRANT ALL ON incoming_invoice_audit_log   TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_incoming_invoices_updated_at ON incoming_invoices;
CREATE TRIGGER trg_incoming_invoices_updated_at
  BEFORE UPDATE ON incoming_invoices
  FOR EACH ROW EXECUTE FUNCTION invoices_set_updated_at();
