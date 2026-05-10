-- =====================================================
-- 00110: Auto-generated tasks for unanswered customer emails
-- Sprint 8E-1B foundation
-- =====================================================

BEGIN;

-- 1. Drop NOT NULL paa created_by (system-oprettede tasks har ingen menneske-skaber)
ALTER TABLE customer_tasks
  ALTER COLUMN created_by DROP NOT NULL;

-- 2. Sporbarheds-kolonner
ALTER TABLE customer_tasks
  ADD COLUMN IF NOT EXISTS source_email_id uuid
    REFERENCES incoming_emails(id) ON DELETE SET NULL;

ALTER TABLE customer_tasks
  ADD COLUMN IF NOT EXISTS source_conversation_id text;

ALTER TABLE customer_tasks
  ADD COLUMN IF NOT EXISTS auto_generated boolean NOT NULL DEFAULT false;

ALTER TABLE customer_tasks
  ADD COLUMN IF NOT EXISTS auto_rule text;

-- 3. Standard indexes (partielle)
CREATE INDEX IF NOT EXISTS idx_customer_tasks_source_email_id
  ON customer_tasks(source_email_id)
  WHERE source_email_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customer_tasks_source_conversation_id
  ON customer_tasks(source_conversation_id)
  WHERE source_conversation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customer_tasks_auto_rule
  ON customer_tasks(auto_rule)
  WHERE auto_rule IS NOT NULL;

-- 4. PRIMAER dedup: en aaben auto-task pr. (rule, conversation)
CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_tasks_auto_open_by_conversation
  ON customer_tasks(auto_rule, source_conversation_id)
  WHERE auto_generated = true
    AND status != 'done'
    AND source_conversation_id IS NOT NULL;

-- 5. FALLBACK dedup: en aaben auto-task pr. (rule, email) naar conversation_id mangler
CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_tasks_auto_open_by_email
  ON customer_tasks(auto_rule, source_email_id)
  WHERE auto_generated = true
    AND status != 'done'
    AND source_conversation_id IS NULL
    AND source_email_id IS NOT NULL;

COMMIT;

-- 6. Genindlaes PostgREST schema cache
NOTIFY pgrst, 'reload schema';
