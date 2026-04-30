-- =====================================================
-- Migration 00081: Invoice payment + reminder columns (Phase 5.1)
--
-- sent_at + paid_at already exist (00080). This migration adds:
--   payment_reference, reminder_count, last_reminder_at,
--   plus an invoice_reminder_log table for audit + safety windows.
-- =====================================================

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS payment_reference TEXT,
  ADD COLUMN IF NOT EXISTS reminder_count    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_reminder_at  TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_invoices_due_status
  ON invoices(status, due_date)
  WHERE status = 'sent';

-- Audit log of every reminder we attempt (success or failure).
CREATE TABLE IF NOT EXISTS invoice_reminder_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id   UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  level        INTEGER NOT NULL CHECK (level IN (1, 2, 3)),  -- 1, 2 = reminder; 3 = warning / manual review
  status       TEXT NOT NULL CHECK (status IN ('sent', 'skipped', 'failed', 'manual_review')),
  recipient    TEXT,
  reason       TEXT,
  error        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_reminder_log_invoice
  ON invoice_reminder_log(invoice_id, created_at DESC);

ALTER TABLE invoice_reminder_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoice_reminder_log_select_auth" ON invoice_reminder_log;
CREATE POLICY "invoice_reminder_log_select_auth" ON invoice_reminder_log
  FOR SELECT TO authenticated USING (true);

GRANT SELECT ON invoice_reminder_log TO authenticated;
GRANT ALL ON invoice_reminder_log TO service_role;
