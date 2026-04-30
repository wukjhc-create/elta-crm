-- =====================================================
-- Migration 00083: Bank transactions + auto-match (Phase 5.3)
-- =====================================================

CREATE TABLE IF NOT EXISTS bank_transactions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date                  DATE NOT NULL,
  amount                NUMERIC(12,2) NOT NULL,
  reference_text        TEXT,
  sender_name           TEXT,
  matched_invoice_id    UUID REFERENCES invoices(id) ON DELETE SET NULL,
  -- match_status:
  --   unmatched   — no candidate found
  --   matched     — bound to invoice, full payment registered
  --   partial     — bound to invoice, partial payment
  --   overpayment — bound to invoice, paid > final_amount (audit only)
  --   ambiguous   — multiple candidates, manual review needed
  --   manual      — operator linked it via UI
  match_status          TEXT NOT NULL DEFAULT 'unmatched'
                        CHECK (match_status IN ('unmatched','matched','partial','overpayment','ambiguous','manual')),
  match_confidence      TEXT,             -- 'reference' | 'amount+sender' | 'manual'
  matched_at            TIMESTAMPTZ,
  candidate_invoice_ids UUID[],           -- populated when match_status='ambiguous'
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Dedup key — same (date, amount, reference_text) is treated as one
-- transaction. NULL reference normalizes to empty string for the key.
CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_tx_dedup
  ON bank_transactions(date, amount, COALESCE(reference_text, ''));

CREATE INDEX IF NOT EXISTS idx_bank_tx_status   ON bank_transactions(match_status);
CREATE INDEX IF NOT EXISTS idx_bank_tx_invoice  ON bank_transactions(matched_invoice_id) WHERE matched_invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bank_tx_date     ON bank_transactions(date DESC);

ALTER TABLE bank_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bank_tx_all_auth" ON bank_transactions;
CREATE POLICY "bank_tx_all_auth" ON bank_transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON bank_transactions TO authenticated, service_role;
