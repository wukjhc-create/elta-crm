-- =====================================================
-- Migration 00069: Cache resolved Ordrestyring endpoint
-- =====================================================

CREATE TABLE IF NOT EXISTS integration_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE integration_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read integration_settings"
  ON integration_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can upsert integration_settings"
  ON integration_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
