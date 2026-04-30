-- =====================================================
-- Migration 00092: Go-Live audit log.
--
-- Append-only audit row per write action from the Go-Live admin panel.
-- =====================================================

CREATE TABLE IF NOT EXISTS go_live_audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action          TEXT NOT NULL,           -- toggle_rule | test_economic | test_bank_import | run_email_sync | run_invoice_reminders
  entity_id       UUID,                    -- e.g. automation_rule.id when relevant
  previous_value  JSONB,
  new_value       JSONB,
  ok              BOOLEAN NOT NULL DEFAULT true,
  message         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_go_live_audit_user_time
  ON go_live_audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_go_live_audit_action_time
  ON go_live_audit_log(action, created_at DESC);

ALTER TABLE go_live_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "go_live_audit_select_auth" ON go_live_audit_log;
CREATE POLICY "go_live_audit_select_auth" ON go_live_audit_log
  FOR SELECT TO authenticated USING (true);

GRANT SELECT ON go_live_audit_log TO authenticated;
GRANT ALL    ON go_live_audit_log TO service_role;
