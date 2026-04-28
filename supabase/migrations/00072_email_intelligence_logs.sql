-- =====================================================
-- Migration 00072: Email Intelligence Logs + Daily Summary
--
-- Persists per-email AI classification & extraction events
-- and a daily aggregate summary for the dashboard.
-- =====================================================

CREATE TABLE IF NOT EXISTS email_intelligence_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id UUID REFERENCES incoming_emails(id) ON DELETE CASCADE,
  subject TEXT,
  classification TEXT,                  -- 'customer' | 'supplier' | 'newsletter'
  extracted_name TEXT,
  extracted_phone TEXT,
  extracted_address TEXT,
  confidence NUMERIC(4,2),              -- 0.00 .. 1.00
  action TEXT NOT NULL,                 -- 'linked' | 'created' | 'matched' | 'skipped' | 'ignored'
  reason TEXT,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eil_email_id ON email_intelligence_logs(email_id);
CREATE INDEX IF NOT EXISTS idx_eil_action ON email_intelligence_logs(action);
CREATE INDEX IF NOT EXISTS idx_eil_classification ON email_intelligence_logs(classification);
CREATE INDEX IF NOT EXISTS idx_eil_created_at ON email_intelligence_logs(created_at DESC);

ALTER TABLE email_intelligence_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "eil_select" ON email_intelligence_logs
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "eil_insert" ON email_intelligence_logs
  FOR INSERT TO authenticated WITH CHECK (true);

GRANT ALL ON email_intelligence_logs TO authenticated;
GRANT ALL ON email_intelligence_logs TO service_role;

-- Daily aggregate summary (one row per UTC day)
CREATE TABLE IF NOT EXISTS email_intelligence_daily_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  summary_date DATE NOT NULL UNIQUE,
  total_processed INTEGER DEFAULT 0,
  customers_created INTEGER DEFAULT 0,
  customers_matched INTEGER DEFAULT 0,
  newsletters_ignored INTEGER DEFAULT 0,
  low_confidence_skipped INTEGER DEFAULT 0,
  other_skipped INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eids_date ON email_intelligence_daily_summary(summary_date DESC);

ALTER TABLE email_intelligence_daily_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "eids_select" ON email_intelligence_daily_summary
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "eids_insert" ON email_intelligence_daily_summary
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "eids_update" ON email_intelligence_daily_summary
  FOR UPDATE TO authenticated USING (true);

GRANT ALL ON email_intelligence_daily_summary TO authenticated;
GRANT ALL ON email_intelligence_daily_summary TO service_role;
