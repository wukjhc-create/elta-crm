-- =====================================================
-- Migration 00089: AI optimization layer (Phase 9)
--
-- - work_orders.low_profit  flag flipped automatically when a snapshot
--   lands with margin_percentage < 15.
-- - ai_suggestions table — every suggestion the system surfaces gets
--   audited so we can later review which ones converted into action.
-- =====================================================

ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS low_profit BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS ai_suggestions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- One of: pricing | margin_alert | offer_suggestion | employee_insight |
  --        forecast | dashboard_insight
  type          TEXT NOT NULL,
  -- Optional anchor — work_order_id, offer_id, employee_id … as text uuid.
  entity_type   TEXT,
  entity_id     UUID,
  -- 0–1 confidence score the model attached to the suggestion.
  confidence    NUMERIC(4,3),
  message       TEXT NOT NULL,
  payload       JSONB,
  acted_on      BOOLEAN NOT NULL DEFAULT false,
  acted_at      TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_suggestions_type_time
  ON ai_suggestions(type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_entity
  ON ai_suggestions(entity_type, entity_id, created_at DESC);

ALTER TABLE ai_suggestions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_suggestions_all_auth" ON ai_suggestions;
CREATE POLICY "ai_suggestions_all_auth" ON ai_suggestions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON ai_suggestions TO authenticated, service_role;

-- ---------- Auto-flag low-profit work orders ----------

CREATE OR REPLACE FUNCTION trg_profit_snapshot_flag_low()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Mark or clear the low_profit flag based on the latest snapshot.
  IF NEW.revenue > 0 AND NEW.margin_percentage < 15 THEN
    UPDATE work_orders SET low_profit = true WHERE id = NEW.work_order_id;

    INSERT INTO ai_suggestions (type, entity_type, entity_id, confidence, message, payload)
    VALUES (
      'margin_alert',
      'work_order',
      NEW.work_order_id,
      0.95,
      'Lavt overskud: margin ' || NEW.margin_percentage::text || ' % på arbejdsordre',
      jsonb_build_object(
        'work_order_id', NEW.work_order_id,
        'margin_percentage', NEW.margin_percentage,
        'profit', NEW.profit,
        'revenue', NEW.revenue
      )
    );
  ELSIF NEW.revenue > 0 AND NEW.margin_percentage >= 15 THEN
    UPDATE work_orders SET low_profit = false WHERE id = NEW.work_order_id AND low_profit = true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_work_order_profit_flag ON work_order_profit;
CREATE TRIGGER trg_work_order_profit_flag
  AFTER INSERT ON work_order_profit
  FOR EACH ROW EXECUTE FUNCTION trg_profit_snapshot_flag_low();

CREATE INDEX IF NOT EXISTS idx_work_orders_low_profit
  ON work_orders(low_profit) WHERE low_profit = true;
