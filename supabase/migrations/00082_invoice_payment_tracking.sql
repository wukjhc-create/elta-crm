-- =====================================================
-- Migration 00082: Invoice payment tracking (Phase 5.2)
--
-- Splits "I sent the invoice" (invoices.status) from "Has it been paid"
-- (invoices.payment_status). status keeps draft → sent → paid for the
-- mailbox lifecycle; payment_status tracks pending → partial → paid as
-- money lands.
-- =====================================================

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'partial', 'paid')),
  ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0;

-- Backfill: any invoice already marked paid (from Phase 5.1) gets
-- payment_status='paid' and amount_paid=final_amount.
UPDATE invoices
   SET payment_status = 'paid',
       amount_paid    = final_amount
 WHERE status = 'paid'
   AND payment_status <> 'paid';

CREATE INDEX IF NOT EXISTS idx_invoices_payment_status
  ON invoices(payment_status);

-- Per-payment audit trail.
CREATE TABLE IF NOT EXISTS invoice_payments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id    UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount        NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  reference     TEXT,
  recorded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice
  ON invoice_payments(invoice_id, recorded_at DESC);

ALTER TABLE invoice_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoice_payments_all_auth" ON invoice_payments;
CREATE POLICY "invoice_payments_all_auth" ON invoice_payments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON invoice_payments TO authenticated, service_role;
