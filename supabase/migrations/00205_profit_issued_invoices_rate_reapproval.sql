-- 00205 — Avance fra udstedte fakturaer + satsskift kræver ny godkendelse (review 2026-10-08).
-- STATUS: UDKAST — BLOCKED_APPROVAL. Ikke kørt på staging eller prod.
--
-- 1. calculate_work_order_profit: omsætning tog den SENESTE faktura på arbejdsordren uanset status (også kladde og
--    annulleret/krediteret). Nu kun status sent/paid, ikke annulleret, ikke kreditnota; ellers planlagt omsætning som før.
--    Definitionen er 00202's, KUN udvidet med WHERE-betingelsen.
-- 2. (UDGÅET — dækket af 00208) time_logs_approval_guard: employee_rate_id manglede blandt felterne der nulstiller godkendelsen. Appen afviser
--    allerede satsskift på godkendte timer uden godkenderret (time-logs.ts); triggeren lukker også direkte REST-skrivning.
--    Definitionen er 00185's, KUN udvidet med én betingelse.
--
-- Pre/post (read-only): scripts/prod-fn-acl.ts + pg_get_functiondef-diff (kun de to betingelser).
-- Rollback: genkør calculate_work_order_profit fra 00202 og time_logs_approval_guard fra 00185.

BEGIN;

CREATE OR REPLACE FUNCTION public.calculate_work_order_profit(p_work_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
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
     AND end_time IS NOT NULL
     AND approval_status <> 'rejected';  -- 00202: afviste timer er ikke udført arbejde

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
     -- 00205: kun udstedte, ikke-annullerede almindelige fakturaer (før også kladder → omsætning fra en ikke-sendt faktura)
     AND status IN ('sent', 'paid') AND voided_at IS NULL AND COALESCE(invoice_type, 'standard') <> 'credit'
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
       AND tl.end_time IS NOT NULL
       AND tl.approval_status <> 'rejected';  -- 00202

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
$function$
;

-- Staging-drift: prod har EXECUTE for service_role på calculate_work_order_profit (scripts/prod-fn-acl.ts), staging
-- manglede den efter 00192's REVOKE … FROM PUBLIC. Idempotent — ændrer intet i prod.
GRANT EXECUTE ON FUNCTION public.calculate_work_order_profit(uuid) TO service_role;

-- (Guard-delen er FJERNET 2026-10-09: 00208 — kørt i prod — indeholder en udvidet guard (satsskift nulstiller
-- godkendelse + sats-ejerskab). Denne migration må ikke overskrive den.)


NOTIFY pgrst, 'reload schema';
COMMIT;
