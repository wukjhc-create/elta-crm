-- =====================================================
-- Migration 00090: Autopilot (Phase 10)
-- =====================================================

CREATE TABLE IF NOT EXISTS automation_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  -- One of: offer_created | offer_accepted | invoice_created
  --       | invoice_overdue | work_order_done | new_customer
  trigger         TEXT NOT NULL,
  condition_json  JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- One of: send_email | create_task | create_invoice | create_invoice_from_offer
  --       | create_invoice_from_work_order | send_reminder | notify
  action          TEXT NOT NULL,
  action_config   JSONB NOT NULL DEFAULT '{}'::jsonb,
  active          BOOLEAN NOT NULL DEFAULT true,
  dry_run         BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_rules_trigger
  ON automation_rules(trigger) WHERE active = true;

CREATE TABLE IF NOT EXISTS automation_executions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id       UUID NOT NULL REFERENCES automation_rules(id) ON DELETE CASCADE,
  entity_type   TEXT NOT NULL,                          -- offer | invoice | work_order | customer
  entity_id     UUID NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('executed','skipped','failed','dry_run')),
  result        JSONB,
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_exec_rule_entity
  ON automation_executions(rule_id, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_exec_status_time
  ON automation_executions(status, created_at DESC);

-- Hard cap: at most ONE successful execution per (rule, entity) — prevents
-- loops and double-fires on retried events. dry_run/skipped/failed don't
-- consume the slot.
CREATE UNIQUE INDEX IF NOT EXISTS uq_automation_exec_one_per_entity
  ON automation_executions(rule_id, entity_id)
  WHERE status = 'executed';

ALTER TABLE automation_rules      ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_executions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "automation_rules_all_auth"      ON automation_rules;
DROP POLICY IF EXISTS "automation_executions_all_auth" ON automation_executions;

CREATE POLICY "automation_rules_all_auth"
  ON automation_rules      FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "automation_executions_all_auth"
  ON automation_executions FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON automation_rules      TO authenticated, service_role;
GRANT ALL ON automation_executions TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_automation_rules_updated_at ON automation_rules;
CREATE TRIGGER trg_automation_rules_updated_at
  BEFORE UPDATE ON automation_rules
  FOR EACH ROW EXECUTE FUNCTION invoices_set_updated_at();

-- ---------- Default rules ----------
-- Inserted only if no rule of the same (trigger, action) pair exists yet,
-- so re-running setup-db never duplicates them.

INSERT INTO automation_rules (name, trigger, condition_json, action, action_config, active)
SELECT * FROM (VALUES
  ('Auto-faktura ved tilbud accepteret',
   'offer_accepted', '{}'::jsonb,
   'create_invoice_from_offer',
   '{"due_days": 14}'::jsonb, true),

  ('Send rykker ved forfaldne fakturaer',
   'invoice_overdue', '{"days_overdue": {"op": "gte", "value": 3}}'::jsonb,
   'send_reminder',
   '{}'::jsonb, true),

  ('Auto-faktura ved arbejdsordre færdig',
   'work_order_done',
   '{"auto_invoice_on_done": {"op": "eq", "value": true}}'::jsonb,
   'create_invoice_from_work_order',
   '{"due_days": 14}'::jsonb, true),

  ('Opret follow-up opgave for ny kunde',
   'new_customer', '{}'::jsonb,
   'create_task',
   '{"title": "Følg op med ny kunde", "days": 3}'::jsonb, true)
) AS seed(name, trigger, condition_json, action, action_config, active)
WHERE NOT EXISTS (
  SELECT 1 FROM automation_rules ar WHERE ar.trigger = seed.trigger AND ar.action = seed.action
);
