-- =====================================================
-- Migration 00080: Invoices (Phase 5)
--
-- Tables:
--   invoices         — header per invoice
--   invoice_lines    — line items (copied from offer_line_items at create)
--
-- Sequential per-year numbering: F-YYYY-0001 (table-locked counter).
-- RPC create_invoice_from_offer(offer_id) is idempotent and validates
-- the offer is accepted before inserting.
-- =====================================================

-- ---------- 1. invoices ----------
CREATE TABLE IF NOT EXISTS invoices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number  TEXT UNIQUE NOT NULL,
  customer_id     UUID REFERENCES customers(id) ON DELETE SET NULL,
  offer_id        UUID UNIQUE REFERENCES offers(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','paid')),
  total_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  final_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency        TEXT NOT NULL DEFAULT 'DKK',
  due_date        DATE,
  sent_at         TIMESTAMPTZ,
  paid_at         TIMESTAMPTZ,
  pdf_url         TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status   ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_created  ON invoices(created_at DESC);

-- ---------- 2. invoice_lines ----------
CREATE TABLE IF NOT EXISTS invoice_lines (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id   UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  position     INTEGER NOT NULL DEFAULT 0,
  description  TEXT NOT NULL,
  quantity     NUMERIC(12,2) NOT NULL DEFAULT 1,
  unit         TEXT,
  unit_price   NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_price  NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice ON invoice_lines(invoice_id, position);

-- ---------- 3. invoice_number_counters ----------
-- One row per year. SELECT FOR UPDATE inside the RPC serializes allocation
-- so two concurrent calls in the same year cannot get the same number.
CREATE TABLE IF NOT EXISTS invoice_number_counters (
  year   INTEGER PRIMARY KEY,
  next_n INTEGER NOT NULL DEFAULT 1
);

-- ---------- 4. RLS ----------
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_number_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoices_all_auth" ON invoices;
CREATE POLICY "invoices_all_auth" ON invoices FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "invoice_lines_all_auth" ON invoice_lines;
CREATE POLICY "invoice_lines_all_auth" ON invoice_lines FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "invoice_counters_select_auth" ON invoice_number_counters;
CREATE POLICY "invoice_counters_select_auth" ON invoice_number_counters FOR SELECT TO authenticated USING (true);

GRANT ALL ON invoices TO authenticated, service_role;
GRANT ALL ON invoice_lines TO authenticated, service_role;
GRANT SELECT ON invoice_number_counters TO authenticated;
GRANT ALL ON invoice_number_counters TO service_role;

-- ---------- 5. updated_at trigger ----------
CREATE OR REPLACE FUNCTION invoices_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoices_updated_at ON invoices;
CREATE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION invoices_set_updated_at();

-- ---------- 6. allocate_invoice_number ----------
CREATE OR REPLACE FUNCTION allocate_invoice_number()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_year INTEGER := EXTRACT(YEAR FROM NOW())::INTEGER;
  v_n    INTEGER;
BEGIN
  INSERT INTO invoice_number_counters(year, next_n)
       VALUES (v_year, 1)
  ON CONFLICT (year) DO NOTHING;

  -- Lock the row for the current year, then take + bump.
  SELECT next_n INTO v_n FROM invoice_number_counters WHERE year = v_year FOR UPDATE;
  UPDATE invoice_number_counters SET next_n = v_n + 1 WHERE year = v_year;

  RETURN 'F-' || v_year::TEXT || '-' || LPAD(v_n::TEXT, 4, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION allocate_invoice_number() TO authenticated, service_role;

-- ---------- 7. create_invoice_from_offer ----------
-- Idempotent: returns the existing invoice id if one is already linked.
-- Validates offer exists AND status='accepted'.
-- Copies offer_line_items → invoice_lines in one transaction (function = txn).
-- Defaults due_date to today + 14 days. tax_percentage from the offer is
-- honored if set (else 25). Caller may override due_date with p_due_days.

CREATE OR REPLACE FUNCTION create_invoice_from_offer(
  p_offer_id  UUID,
  p_due_days  INTEGER DEFAULT 14
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_offer       RECORD;
  v_existing_id UUID;
  v_invoice_id  UUID;
  v_invoice_no  TEXT;
  v_total       NUMERIC(12,2);
  v_tax_pct     NUMERIC(5,2);
  v_tax         NUMERIC(12,2);
  v_final       NUMERIC(12,2);
  v_currency    TEXT;
BEGIN
  -- Validate offer exists + is accepted. Lock the row to avoid a race
  -- where two callers see "no invoice yet" simultaneously.
  SELECT id, status, customer_id, currency, tax_percentage
    INTO v_offer
    FROM offers
   WHERE id = p_offer_id
   FOR UPDATE;

  IF v_offer.id IS NULL THEN
    RAISE EXCEPTION 'create_invoice_from_offer: offer % not found', p_offer_id;
  END IF;

  IF v_offer.status <> 'accepted' THEN
    RAISE EXCEPTION 'create_invoice_from_offer: offer % is %, expected accepted', p_offer_id, v_offer.status;
  END IF;

  -- Idempotency: if an invoice already exists for this offer, return it.
  SELECT id INTO v_existing_id FROM invoices WHERE offer_id = p_offer_id LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    RETURN v_existing_id;
  END IF;

  -- Compute totals from offer_line_items (sale_price * quantity).
  SELECT COALESCE(SUM(ROUND((COALESCE(li.sale_price, li.unit_price, 0) * li.quantity)::numeric, 2)), 0)
    INTO v_total
    FROM offer_line_items li
   WHERE li.offer_id = p_offer_id;

  v_tax_pct  := COALESCE(v_offer.tax_percentage, 25);
  v_tax      := ROUND((v_total * v_tax_pct / 100)::numeric, 2);
  v_final    := ROUND((v_total + v_tax)::numeric, 2);
  v_currency := COALESCE(v_offer.currency, 'DKK');

  v_invoice_no := allocate_invoice_number();

  INSERT INTO invoices (
    invoice_number, customer_id, offer_id, status,
    total_amount, tax_amount, final_amount, currency, due_date
  ) VALUES (
    v_invoice_no, v_offer.customer_id, p_offer_id, 'draft',
    v_total, v_tax, v_final, v_currency,
    (CURRENT_DATE + (GREATEST(COALESCE(p_due_days, 14), 0) || ' days')::interval)::date
  )
  RETURNING id INTO v_invoice_id;

  -- Copy all offer line items.
  INSERT INTO invoice_lines (invoice_id, position, description, quantity, unit, unit_price, total_price)
  SELECT
    v_invoice_id,
    COALESCE(li.position, ROW_NUMBER() OVER (ORDER BY li.position NULLS LAST, li.id)),
    COALESCE(li.description, ''),
    COALESCE(li.quantity, 0),
    li.unit,
    COALESCE(li.sale_price, li.unit_price, 0),
    ROUND((COALESCE(li.sale_price, li.unit_price, 0) * COALESCE(li.quantity, 0))::numeric, 2)
    FROM offer_line_items li
   WHERE li.offer_id = p_offer_id;

  RETURN v_invoice_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_invoice_from_offer(UUID, INTEGER) TO authenticated, service_role;
