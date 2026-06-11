-- =====================================================================
-- 00134: Sprint 2D — align SQL sale-rate fallback 650 → 495
-- =====================================================================
--
-- FORMÅL
--   Bring de to SQL-funktioners salgs-/timepris-nødfallback i sync med
--   den canonical FALLBACK_SALE_RATE (495). TS-laget er master-stien og
--   sender altid raten (fra calculation_settings via getStandardSaleRate);
--   denne SQL-fallback er KUN sidste nødværn når en medarbejder mangler
--   employees.hourly_rate.
--
-- ÆNDRER (kun literalen 650 → 495, fuld funktionskrop reproduceret):
--   1. calculate_work_order_profit(UUID)            v_default_rate 650 → 495
--   2. create_invoice_from_work_order(UUID,INT,NUM) p_default_hourly_rate 650 → 495
--
-- RØRER IKKE
--   - time_logs_set_cost_amount() — cost-fallback 400 BEVARES (urørt)
--   - ingen backfill, ingen schema-ændringer, ingen historiske rækker
--   - eksisterende invoices/invoice_lines/work_order_profit genberegnes ikke
--
-- SIKKERHED
--   - Signaturer uændrede → CREATE OR REPLACE swapper kun kroppen.
--   - Triggere (trg_invoices_snapshot_profit, trg_work_orders_done_snapshot)
--     peger på funktioner ved navn og bevares.
--   - Fallbacken fyrer kun for rate-løse medarbejdere (0 i prod i dag).
--
-- ROLLBACK
--   Kør de oprindelige funktionskroppe (00087/00088) igen, dvs. samme to
--   CREATE OR REPLACE med 495 → 650. Ingen data at rulle tilbage.
-- =====================================================================

BEGIN;

-- ---------- 1. calculate_work_order_profit (00088) ----------
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
  v_default_rate  NUMERIC(10,2) := 495;   -- Sprint 2D: canonical sale fallback (was 650)
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

-- ---------- 2. create_invoice_from_work_order (00087) ----------
CREATE OR REPLACE FUNCTION create_invoice_from_work_order(
  p_work_order_id        UUID,
  p_due_days             INTEGER DEFAULT 14,
  p_default_hourly_rate  NUMERIC DEFAULT 495   -- Sprint 2D: canonical sale fallback (was 650)
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

COMMIT;
