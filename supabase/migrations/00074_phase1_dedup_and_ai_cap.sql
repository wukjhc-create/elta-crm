-- =====================================================
-- Migration 00074: Phase 1 Stabilization
--
-- 1. UNIQUE partial index on service_cases.source_email_id
-- 2. offers.source_email_id (FK + UNIQUE partial index)
-- 3. ai_usage_daily counter table (daily AI cost cap)
-- 4. Phone normalization backfill
--
-- Pre-migration audit: 0 service_cases duplicates, 0 dirty phones.
-- Migration is purely additive + a cleanup backfill.
-- =====================================================

-- ---------- 1. service_cases dedup safety ----------
-- Set source_email_id to NULL on any future-discovered duplicates so the
-- unique index can be created safely. (None present at write time.)
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (
           PARTITION BY source_email_id
           ORDER BY created_at ASC, id ASC
         ) AS rn
    FROM service_cases
   WHERE source_email_id IS NOT NULL
)
UPDATE service_cases sc
   SET source_email_id = NULL
  FROM ranked r
 WHERE sc.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_service_cases_source_email_id
  ON service_cases(source_email_id)
  WHERE source_email_id IS NOT NULL;

-- ---------- 2. offers.source_email_id ----------
ALTER TABLE offers
  ADD COLUMN IF NOT EXISTS source_email_id UUID
    REFERENCES incoming_emails(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_offers_source_email_id
  ON offers(source_email_id)
  WHERE source_email_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_offers_source_email_id
  ON offers(source_email_id)
  WHERE source_email_id IS NOT NULL;

-- ---------- 3. ai_usage_daily ----------
CREATE TABLE IF NOT EXISTS ai_usage_daily (
  day DATE PRIMARY KEY,
  call_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_daily_day
  ON ai_usage_daily(day DESC);

ALTER TABLE ai_usage_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_usage_select" ON ai_usage_daily
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "ai_usage_insert" ON ai_usage_daily
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "ai_usage_update" ON ai_usage_daily
  FOR UPDATE TO authenticated USING (true);

GRANT ALL ON ai_usage_daily TO authenticated;
GRANT ALL ON ai_usage_daily TO service_role;

-- ---------- 4. Phone normalization backfill ----------
UPDATE customers
   SET phone = regexp_replace(phone, '[^+0-9]', '', 'g')
 WHERE phone IS NOT NULL AND phone ~ '[^+0-9]';

UPDATE customers
   SET mobile = regexp_replace(mobile, '[^+0-9]', '', 'g')
 WHERE mobile IS NOT NULL AND mobile ~ '[^+0-9]';
