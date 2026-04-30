-- =====================================================
-- Migration 00085: System health log (Phase 6)
-- =====================================================

CREATE TABLE IF NOT EXISTS system_health_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service     TEXT NOT NULL,                       -- email | email_intel | auto_case | auto_offer | invoice | bank | economic | health_check
  status      TEXT NOT NULL CHECK (status IN ('ok','warning','error')),
  message     TEXT,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_health_service_time
  ON system_health_log(service, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_health_status_time
  ON system_health_log(status, created_at DESC);

ALTER TABLE system_health_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "system_health_select_auth" ON system_health_log;
CREATE POLICY "system_health_select_auth" ON system_health_log
  FOR SELECT TO authenticated USING (true);

GRANT SELECT ON system_health_log TO authenticated;
GRANT ALL ON system_health_log TO service_role;
