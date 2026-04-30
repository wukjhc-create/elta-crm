-- =====================================================
-- Migration 00088: Payroll + profitability (Phase 8)
--
-- - employees.cost_rate (hourly cost incl. overhead, distinct from
--   the sale-side hourly_rate added in 00087)
-- - time_logs.cost_amount (auto-populated via trigger when a timer
--   is stopped or a manual entry inserted)
-- - work_order_profit snapshot table (append-only — every snapshot
--   is a new row; we never overwrite history)
-- - calculate_work_order_profit() — pure read, returns JSONB
-- - snapshot_work_order_profit() — calculates + inserts row
-- - triggers: snapshot when invoice for WO created OR WO transitions
--   to status='done'
-- =====================================================

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS cost_rate NUMERIC(10,2);

ALTER TABLE time_logs
  ADD COLUMN IF NOT EXISTS cost_amount NUMERIC(12,2);

-- ---------- 1. Auto-populate time_logs.cost_amount ----------

CREATE OR REPLACE FUNCTION time_logs_set_cost_amount()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_rate    NUMERIC(10,2);
  v_hours   NUMERIC(10,2);
  v_default NUMERIC(10,2) := 400;     -- conservative cost fallback
BEGIN
  -- Only compute when the timer is closed (end_time NOT NULL).
  IF NEW.end_time IS NULL THEN
    NEW.cost_amount := NULL;
    RETURN NEW;
  END IF;

  v_hours := ROUND((EXTRACT(EPOCH FROM (NEW.end_time - NEW.start_time)) / 3600.0)::numeric, 2);

  SELECT cost_rate INTO v_rate FROM employees WHERE id = NEW.employee_id;
  NEW.cost_amount := ROUND((GREATEST(v_hours, 0) * COALESCE(v_rate, v_default))::numeric, 2);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_time_logs_cost_amount ON time_logs;
CREATE TRIGGER trg_time_logs_cost_amount
  BEFORE INSERT OR UPDATE OF end_time, employee_id ON time_logs
  FOR EACH ROW EXECUTE FUNCTION time_logs_set_cost_amount();

-- Backfill any pre-existing closed rows.
UPDATE time_logs
   SET cost_amount = ROUND((GREATEST(hours, 0) * COALESCE(
     (SELECT cost_rate FROM employees WHERE employees.id = time_logs.employee_id), 400
   ))::numeric, 2)
 WHERE end_time IS NOT NULL AND cost_amount IS NULL;

-- ---------- 2. work_order_profit snapshot ----------

CREATE TABLE IF NOT EXISTS work_order_profit (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id       UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  revenue             NUMERIC(12,2) NOT NULL DEFAULT 0,
  labor_cost          NUMERIC(12,2) NOT NULL DEFAULT 0,
  material_cost       NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_cost          NUMERIC(12,2) NOT NULL DEFAULT 0,
  profit              NUMERIC(12,2) NOT NULL DEFAULT 0,
  margin_percentage   NUMERIC(6,2)  NOT NULL DEFAULT 0,
  source              TEXT NOT NULL DEFAULT 'manual'
                      CHECK (source IN ('manual','invoice_created','work_order_done','recompute')),
  invoice_id          UUID REFERENCES invoices(id) ON DELETE SET NULL,
  details             JSONB,                     -- counts of logs / lines that contributed
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_work_order_profit_wo
  ON work_order_profit(work_order_id, created_at DESC);

ALTER TABLE work_order_profit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wo_profit_all_auth" ON work_order_profit;
CREATE POLICY "wo_profit_all_auth" ON work_order_profit
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON work_order_profit TO authenticated, service_role;

-- ---------- 3. calculate_work_order_profit ----------

CREATE OR REPLACE FUNCTION calculate_work_order_profit(p_work_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_wo            RECORD;
  v_invoice       RECORD;
  v_revenue       NUMERIC(12,2) := 0;
  v_labor         NUMERIC(12,2) := 0;
  v_material      NUMERIC(12,2) := 0;
  v_planned_hours NUMERIC(12,2) := 0;
  v_planned_labor NUMERIC(12,2) := 0;
  v_total         NUMERIC(12,2);
  v_profit        NUMERIC(12,2);
  v_margin        NUMERIC(6,2)  := 0;
  v_default_rate  NUMERIC(10,2) := 650;
  v_log_count     INTEGER       := 0;
  v_offer_lines   INTEGER       := 0;
  v_revenue_src   TEXT          := 'planned';
  v_invoice_id    UUID;
BEGIN
  SELECT id, customer_id, source_offer_id, status
    INTO v_wo
    FROM work_orders
   WHERE id = p_work_order_id;

  IF v_wo.id IS NULL THEN
    RAISE EXCEPTION 'calculate_work_order_profit: work order % not found', p_work_order_id;
  END IF;

  -- ---- labor cost (always from time_logs) ----
  SELECT COALESCE(SUM(cost_amount), 0)::numeric(12,2),
         COALESCE(SUM(hours), 0)::numeric(12,2),
         COUNT(*)
    INTO v_labor, v_planned_hours, v_log_count
    FROM time_logs
   WHERE work_order_id = p_work_order_id
     AND end_time IS NOT NULL;

  -- ---- material cost (from source offer's supplier cost) ----
  IF v_wo.source_offer_id IS NOT NULL THEN
    SELECT
      COALESCE(SUM(COALESCE(supplier_cost_price_at_creation, cost_price, 0) * COALESCE(quantity, 0)), 0)::numeric(12,2),
      COUNT(*)
      INTO v_material, v_offer_lines
      FROM offer_line_items
     WHERE offer_id = v_wo.source_offer_id
       AND (line_type IS NULL OR line_type IN ('product','material'));
  END IF;

  -- ---- revenue ----
  -- Prefer the actual invoice (ex-VAT total_amount). Fall back to
  -- "planned": billable hours × default sale rate + sum(offer sale).
  SELECT id, total_amount INTO v_invoice
    FROM invoices
   WHERE work_order_id = p_work_order_id
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_invoice.id IS NOT NULL THEN
    v_revenue := COALESCE(v_invoice.total_amount, 0);
    v_invoice_id := v_invoice.id;
    v_revenue_src := 'invoice';
  ELSE
    -- planned labor revenue (hours × employee.hourly_rate, fallback rate)
    SELECT COALESCE(SUM(
             COALESCE(tl.hours, 0) * COALESCE(e.hourly_rate, v_default_rate)
           ), 0)::numeric(12,2)
      INTO v_planned_labor
      FROM time_logs tl
      LEFT JOIN employees e ON e.id = tl.employee_id
     WHERE tl.work_order_id = p_work_order_id
       AND tl.billable = true
       AND tl.end_time IS NOT NULL;

    -- planned material revenue (offer sale_price × quantity)
    IF v_wo.source_offer_id IS NOT NULL THEN
      v_revenue := v_planned_labor + COALESCE((
        SELECT SUM(COALESCE(sale_price, unit_price, 0) * COALESCE(quantity, 0))
          FROM offer_line_items
         WHERE offer_id = v_wo.source_offer_id
           AND (line_type IS NULL OR line_type IN ('product','material'))
      ), 0)::numeric(12,2);
    ELSE
      v_revenue := v_planned_labor;
    END IF;
  END IF;

  v_total  := ROUND((v_labor + v_material)::numeric, 2);
  v_profit := ROUND((v_revenue - v_total)::numeric, 2);
  IF v_revenue > 0 THEN
    v_margin := ROUND((v_profit / v_revenue * 100)::numeric, 2);
  END IF;

  RETURN jsonb_build_object(
    'work_order_id',       p_work_order_id,
    'revenue',             v_revenue,
    'labor_cost',          v_labor,
    'material_cost',       v_material,
    'total_cost',          v_total,
    'profit',              v_profit,
    'margin_percentage',   v_margin,
    'revenue_source',      v_revenue_src,
    'invoice_id',          v_invoice_id,
    'time_log_count',      v_log_count,
    'offer_line_count',    v_offer_lines,
    'total_hours',         v_planned_hours
  );
END;
$$;

GRANT EXECUTE ON FUNCTION calculate_work_order_profit(UUID) TO authenticated, service_role;

-- ---------- 4. snapshot_work_order_profit ----------

CREATE OR REPLACE FUNCTION snapshot_work_order_profit(
  p_work_order_id UUID,
  p_source        TEXT DEFAULT 'manual'
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_calc       JSONB;
  v_snapshot_id UUID;
BEGIN
  v_calc := calculate_work_order_profit(p_work_order_id);

  INSERT INTO work_order_profit (
    work_order_id, revenue, labor_cost, material_cost,
    total_cost, profit, margin_percentage,
    source, invoice_id, details
  ) VALUES (
    p_work_order_id,
    (v_calc->>'revenue')::numeric,
    (v_calc->>'labor_cost')::numeric,
    (v_calc->>'material_cost')::numeric,
    (v_calc->>'total_cost')::numeric,
    (v_calc->>'profit')::numeric,
    (v_calc->>'margin_percentage')::numeric,
    p_source,
    NULLIF(v_calc->>'invoice_id', '')::uuid,
    v_calc
  )
  RETURNING id INTO v_snapshot_id;

  RETURN v_snapshot_id;
END;
$$;

GRANT EXECUTE ON FUNCTION snapshot_work_order_profit(UUID, TEXT) TO authenticated, service_role;

-- ---------- 5. Triggers ----------

-- 5a. After invoice is created with work_order_id → snapshot.
CREATE OR REPLACE FUNCTION trg_invoice_snapshot_profit()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.work_order_id IS NOT NULL THEN
    PERFORM snapshot_work_order_profit(NEW.work_order_id, 'invoice_created');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoices_snapshot_profit ON invoices;
CREATE TRIGGER trg_invoices_snapshot_profit
  AFTER INSERT ON invoices
  FOR EACH ROW EXECUTE FUNCTION trg_invoice_snapshot_profit();

-- 5b. When work_order transitions into status='done' → snapshot.
CREATE OR REPLACE FUNCTION trg_work_order_done_snapshot_profit()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'done' AND (OLD.status IS DISTINCT FROM 'done') THEN
    PERFORM snapshot_work_order_profit(NEW.id, 'work_order_done');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_work_orders_done_snapshot ON work_orders;
CREATE TRIGGER trg_work_orders_done_snapshot
  AFTER UPDATE OF status ON work_orders
  FOR EACH ROW EXECUTE FUNCTION trg_work_order_done_snapshot_profit();
