-- =====================================================
-- Migration 00087: Invoice from work order (Phase 7.1)
-- =====================================================

-- ---------- 1. Schema additions ----------

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS work_order_id UUID REFERENCES work_orders(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_work_order
  ON invoices(work_order_id)
  WHERE work_order_id IS NOT NULL;

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC(10,2);

ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS auto_invoice_on_done BOOLEAN NOT NULL DEFAULT false,
  -- Optional explicit material source. When NULL, we never guess —
  -- material lines simply aren't included.
  ADD COLUMN IF NOT EXISTS source_offer_id UUID REFERENCES offers(id) ON DELETE SET NULL;

-- ---------- 2. RPC: create_invoice_from_work_order ----------
--
-- Behaviour:
--   - Validates work_order exists AND status='done'.
--   - Idempotent: returns existing invoice id if one is linked already.
--   - Time lines: one per employee, summing all billable, completed,
--     un-billed time_logs (invoice_line_id IS NULL). Hours × rate.
--     Rate = COALESCE(employees.hourly_rate, p_default_hourly_rate).
--   - Material lines: if work_order.source_offer_id IS NOT NULL, copies
--     that offer's product/material lines (line_type='product' OR with
--     supplier_product_id / material_id set).
--   - Allocates F-YYYY-NNNN via allocate_invoice_number().
--   - tax_amount = 25% of total_amount.
--   - On success, marks the source time_logs.invoice_line_id so they
--     can never be billed twice.

CREATE OR REPLACE FUNCTION create_invoice_from_work_order(
  p_work_order_id        UUID,
  p_due_days             INTEGER DEFAULT 14,
  p_default_hourly_rate  NUMERIC DEFAULT 650
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_wo            RECORD;
  v_existing_id   UUID;
  v_invoice_id    UUID;
  v_invoice_no    TEXT;
  v_total         NUMERIC(12,2) := 0;
  v_tax           NUMERIC(12,2);
  v_final         NUMERIC(12,2);
  v_pos           INTEGER := 1;
  v_line_id       UUID;
  v_rec           RECORD;
BEGIN
  SELECT id, status, customer_id, source_offer_id, title
    INTO v_wo
    FROM work_orders
   WHERE id = p_work_order_id
   FOR UPDATE;

  IF v_wo.id IS NULL THEN
    RAISE EXCEPTION 'create_invoice_from_work_order: work order % not found', p_work_order_id;
  END IF;
  IF v_wo.status <> 'done' THEN
    RAISE EXCEPTION 'create_invoice_from_work_order: work order % is %, expected done', p_work_order_id, v_wo.status;
  END IF;

  -- Idempotency.
  SELECT id INTO v_existing_id FROM invoices WHERE work_order_id = p_work_order_id LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    RETURN v_existing_id;
  END IF;

  -- Allocate number + create header (totals filled in after we sum the lines).
  v_invoice_no := allocate_invoice_number();

  INSERT INTO invoices (
    invoice_number, customer_id, work_order_id, status,
    total_amount, tax_amount, final_amount, currency, due_date
  ) VALUES (
    v_invoice_no, v_wo.customer_id, p_work_order_id, 'draft',
    0, 0, 0, 'DKK',
    (CURRENT_DATE + (GREATEST(COALESCE(p_due_days, 14), 0) || ' days')::interval)::date
  )
  RETURNING id INTO v_invoice_id;

  -- ---- A. Time lines (one per employee) ----
  FOR v_rec IN
    SELECT
      tl.employee_id,
      e.name              AS emp_name,
      ROUND(SUM(tl.hours)::numeric, 2)                                                       AS hrs,
      COALESCE(e.hourly_rate, p_default_hourly_rate)::numeric(12,2)                          AS rate,
      ROUND(SUM(tl.hours)::numeric, 2) * COALESCE(e.hourly_rate, p_default_hourly_rate)::numeric(12,2) AS line_total,
      array_agg(tl.id)    AS log_ids
    FROM time_logs tl
    LEFT JOIN employees e ON e.id = tl.employee_id
    WHERE tl.work_order_id = p_work_order_id
      AND tl.billable = true
      AND tl.end_time IS NOT NULL
      AND tl.invoice_line_id IS NULL
      AND tl.hours > 0
    GROUP BY tl.employee_id, e.name, e.hourly_rate
    HAVING SUM(tl.hours) > 0
  LOOP
    INSERT INTO invoice_lines (
      invoice_id, position, description, quantity, unit, unit_price, total_price
    ) VALUES (
      v_invoice_id,
      v_pos,
      'Arbejde - ' || COALESCE(v_rec.emp_name, 'Tekniker'),
      v_rec.hrs,
      'time',
      v_rec.rate,
      ROUND(v_rec.line_total::numeric, 2)
    )
    RETURNING id INTO v_line_id;

    -- Mark every source log as billed → they can never be picked up again.
    UPDATE time_logs
       SET invoice_line_id = v_line_id
     WHERE id = ANY (v_rec.log_ids);

    v_total := v_total + ROUND(v_rec.line_total::numeric, 2);
    v_pos := v_pos + 1;
  END LOOP;

  -- ---- B. Material lines from source_offer_id (if set) ----
  IF v_wo.source_offer_id IS NOT NULL THEN
    FOR v_rec IN
      SELECT
        oli.position,
        oli.description,
        oli.quantity,
        oli.unit,
        COALESCE(oli.sale_price, oli.unit_price, 0)::numeric(12,2) AS unit_price,
        ROUND((COALESCE(oli.sale_price, oli.unit_price, 0) * COALESCE(oli.quantity, 0))::numeric, 2) AS line_total
      FROM offer_line_items oli
      WHERE oli.offer_id = v_wo.source_offer_id
        AND (oli.line_type IS NULL OR oli.line_type IN ('product','material'))
      ORDER BY oli.position NULLS LAST, oli.id
    LOOP
      INSERT INTO invoice_lines (
        invoice_id, position, description, quantity, unit, unit_price, total_price
      ) VALUES (
        v_invoice_id,
        v_pos,
        v_rec.description,
        v_rec.quantity,
        v_rec.unit,
        v_rec.unit_price,
        v_rec.line_total
      );
      v_total := v_total + v_rec.line_total;
      v_pos := v_pos + 1;
    END LOOP;
  END IF;

  -- ---- Totals (25 % VAT) ----
  v_tax   := ROUND((v_total * 25 / 100)::numeric, 2);
  v_final := ROUND((v_total + v_tax)::numeric, 2);

  UPDATE invoices
     SET total_amount = v_total,
         tax_amount   = v_tax,
         final_amount = v_final
   WHERE id = v_invoice_id;

  RETURN v_invoice_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_invoice_from_work_order(UUID, INTEGER, NUMERIC) TO authenticated, service_role;
