-- =====================================================
-- Migration 00222: arbejdsordre-avance fra samme kilder som sags-økonomien + friske snapshots (PE-1/PE-2)
--
-- STATUS: UDKAST — BLOCKED_APPROVAL (Henrik). Branch profit-engine-00222. ERSTATTER udkastet 00205
--         (profit-rate-00205), hvis eneste resterende del var faktura-filteret i calculate_work_order_profit.
--
-- Baggrund (Profit Engine-review 2026-10-14):
--  PE-1 (S1) calculate_work_order_profit talte materialer KUN via work_orders.source_offer_id (sættes aldrig — prod 0/3)
--       → materialekost 0; planlagt omsætning prissatte timer med medarbejderens LIVE sats i stedet for den frosne
--       time_logs.sale_amount; omsætning = seneste faktura uanset status (også kladde/annulleret, kreditnota ignoreret)
--       → forkert low_profit-flag og AI-indsigter (dashboard-insights, pricing-optimization læser snapshots).
--  PE-2 (S2) snapshots forældes: kun ved "udført" og ved fakturabeløb > 0 — kreditnotaer (negative/ny række uden
--       beløbsændring), statusskift kladde→sendt og timer/materialer registreret efter "udført" gav aldrig et nyt snapshot.
--
-- Ændringer:
--  1. calculate_work_order_profit — samme regler som lib/actions/service-case-economy.ts + lib/invoices/net-invoiced.ts:
--       kost      = time_logs.cost_amount (ikke afviste, afsluttede) + case_materials.total_cost + case_other_costs.total_cost
--                   (linjer med work_order_id = ordren). Ældre ordrer uden egne linjer men med source_offer_id: tilbuddets
--                   kost som før (bagudkompatibelt; prod har 0 sådanne).
--       omsætning = netto faktureret ekskl. moms på ordren: udstedte (sent/paid) fakturaer inkl. annullerede originaler
--                   minus kreditnotaer uanset fortegn (X1-reglen). Ingen udstedte → planlagt: fakturerbare timers frosne
--                   sale_amount (ellers timer × frosset/medarbejder-/standardsats) + fakturerbare materialer/øvrige til salgspris.
--       Returnerer de samme nøgler som før + other_cost, credited_amount, issued_invoice_count.
--  2. snapshot_work_order_profit — springer over når seneste snapshot har samme omsætning og kost (ingen støj).
--  3. trg_invoice_snapshot_profit — reagerer også på status/voided_at/invoice_type og på kreditnotaer (negative, uden
--     work_order_id → ordren findes via credit_of_invoice_id); flytning mellem ordrer snapshotter begge.
--  4. NY trg_cost_rows_snapshot_profit på time_logs, case_materials, case_other_costs: nyt snapshot ('recompute') når
--     en linje på en UDFØRT arbejdsordre oprettes/ændres/slettes.
--  Uændret: trg_profit_snapshot_flag_low (15 %-grænsen samles med PE-7-beslutningen), work_order_profit-skema, ACL.
--
-- Data: ingen eksisterende rækker ændres (prod: 3 arbejdsordrer, 0 snapshots — scripts/prod-profit-fn-defs.ts).
-- Pre/post (read-only): scripts/prod-profit-fn-defs.ts (definitioner, triggere, antal) — post: ny trigger på 3 tabeller.
-- Rollback: genkør calculate_work_order_profit fra 00202, snapshot_work_order_profit fra 00088,
--           trg_invoice_snapshot_profit + trigger fra 00088_fix_invoice_snapshot_trigger (med SECURITY DEFINER/search_path),
--           DROP TRIGGER trg_*_cost_snapshot_profit (3) + DROP FUNCTION trg_cost_rows_snapshot_profit().
-- =====================================================

BEGIN;

-- ---------- 1. calculate_work_order_profit ----------
CREATE OR REPLACE FUNCTION public.calculate_work_order_profit(p_work_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_wo            RECORD;
  v_revenue       NUMERIC(12,2) := 0;
  v_labor         NUMERIC(12,2) := 0;
  v_material      NUMERIC(12,2) := 0;
  v_other         NUMERIC(12,2) := 0;
  v_hours         NUMERIC(12,2) := 0;
  v_total         NUMERIC(12,2);
  v_profit        NUMERIC(12,2);
  v_margin        NUMERIC(6,2)  := 0;
  v_default_rate  NUMERIC(10,2) := 495;   -- Sprint 2D: canonical sale fallback (som 00134/00202)
  v_log_count     INTEGER       := 0;
  v_mat_lines     INTEGER       := 0;
  v_other_lines   INTEGER       := 0;
  v_offer_lines   INTEGER       := 0;
  v_issued        INTEGER       := 0;
  v_invoiced      NUMERIC(12,2) := 0;
  v_credited      NUMERIC(12,2) := 0;
  v_revenue_src   TEXT          := 'planned';
  v_invoice_id    UUID;
  v_use_offer     BOOLEAN       := false;
BEGIN
  SELECT id, customer_id, source_offer_id, status
    INTO v_wo
    FROM work_orders
   WHERE id = p_work_order_id;

  IF v_wo.id IS NULL THEN
    RAISE EXCEPTION 'calculate_work_order_profit: work order % not found', p_work_order_id;
  END IF;

  -- ---- arbejdskost (frosset på timerne) ----
  SELECT COALESCE(SUM(cost_amount), 0)::numeric(12,2),
         COALESCE(SUM(hours), 0)::numeric(12,2),
         COUNT(*)
    INTO v_labor, v_hours, v_log_count
    FROM time_logs
   WHERE work_order_id = p_work_order_id
     AND end_time IS NOT NULL
     AND approval_status <> 'rejected';  -- 00202: afviste timer er ikke udført arbejde

  -- ---- materialer og øvrige omkostninger registreret på ordren (PE-1) ----
  SELECT COALESCE(SUM(COALESCE(total_cost, unit_cost * quantity, 0)), 0)::numeric(12,2), COUNT(*)
    INTO v_material, v_mat_lines
    FROM case_materials
   WHERE work_order_id = p_work_order_id;

  SELECT COALESCE(SUM(COALESCE(total_cost, unit_cost * quantity, 0)), 0)::numeric(12,2), COUNT(*)
    INTO v_other, v_other_lines
    FROM case_other_costs
   WHERE work_order_id = p_work_order_id;

  -- Bagudkompatibelt: ordre uden egne linjer men med kildetilbud → tilbuddets kost (som før 00222)
  IF v_mat_lines = 0 AND v_other_lines = 0 AND v_wo.source_offer_id IS NOT NULL THEN
    v_use_offer := true;
    SELECT
      COALESCE(SUM(COALESCE(supplier_cost_price_at_creation, cost_price, 0) * COALESCE(quantity, 0)), 0)::numeric(12,2),
      COUNT(*)
      INTO v_material, v_offer_lines
      FROM offer_line_items
     WHERE offer_id = v_wo.source_offer_id
       AND (line_type IS NULL OR line_type IN ('product','material'));
  END IF;

  -- ---- omsætning: netto faktureret ekskl. moms (lib/invoices/net-invoiced.ts) ----
  -- Højst én faktura pr. arbejdsordre (uq_invoices_work_order); kreditnotaer har IKKE work_order_id men peger på
  -- originalen (credit_of_invoice_id). Udstedte (sendt/betalt) tæller, også en annulleret original; kreditnotaer
  -- trækkes fra uanset fortegn; kladder aldrig.
  SELECT COUNT(*),
         COALESCE(SUM(COALESCE(total_amount, 0)), 0)::numeric(12,2)
    INTO v_issued, v_invoiced
    FROM invoices
   WHERE work_order_id = p_work_order_id
     AND status IN ('sent', 'paid')
     AND COALESCE(invoice_type, 'standard') <> 'credit';

  SELECT COALESCE(SUM(ABS(COALESCE(cn.total_amount, 0))), 0)::numeric(12,2)
    INTO v_credited
    FROM invoices cn
   WHERE cn.invoice_type = 'credit'
     AND cn.status IN ('sent', 'paid')
     AND cn.credit_of_invoice_id IN (SELECT id FROM invoices WHERE work_order_id = p_work_order_id);

  IF v_issued > 0 THEN
    v_revenue := v_invoiced - v_credited;
    v_revenue_src := 'invoice';
    SELECT id INTO v_invoice_id
      FROM invoices
     WHERE work_order_id = p_work_order_id
       AND status IN ('sent', 'paid')
       AND voided_at IS NULL
       AND COALESCE(invoice_type, 'standard') <> 'credit'
     ORDER BY created_at DESC
     LIMIT 1;
  ELSE
    -- planlagt: fakturerbare timer til FROSSEN salgspris (PE-1: før medarbejderens live sats)
    v_revenue := COALESCE((
      SELECT SUM(COALESCE(tl.sale_amount,
                          COALESCE(tl.hours, 0) * COALESCE(tl.sale_rate_snapshot, e.hourly_rate, v_default_rate)))
        FROM time_logs tl
        LEFT JOIN employees e ON e.id = tl.employee_id
       WHERE tl.work_order_id = p_work_order_id
         AND tl.billable = true
         AND tl.end_time IS NOT NULL
         AND tl.approval_status <> 'rejected'
    ), 0)::numeric(12,2);

    IF v_use_offer THEN
      v_revenue := v_revenue + COALESCE((
        SELECT SUM(COALESCE(sale_price, unit_price, 0) * COALESCE(quantity, 0))
          FROM offer_line_items
         WHERE offer_id = v_wo.source_offer_id
           AND (line_type IS NULL OR line_type IN ('product','material'))
      ), 0)::numeric(12,2);
    ELSE
      v_revenue := v_revenue
        + COALESCE((SELECT SUM(COALESCE(total_sales_price, unit_sales_price * quantity, 0)) FROM case_materials
                     WHERE work_order_id = p_work_order_id AND billable = true), 0)::numeric(12,2)
        + COALESCE((SELECT SUM(COALESCE(total_sales_price, unit_sales_price * quantity, 0)) FROM case_other_costs
                     WHERE work_order_id = p_work_order_id AND billable = true), 0)::numeric(12,2);
    END IF;
  END IF;

  v_total  := ROUND((v_labor + v_material + v_other)::numeric, 2);
  v_profit := ROUND((v_revenue - v_total)::numeric, 2);
  IF v_revenue > 0 THEN
    v_margin := ROUND((v_profit / v_revenue * 100)::numeric, 2);
  END IF;

  RETURN jsonb_build_object(
    'work_order_id',        p_work_order_id,
    'revenue',              v_revenue,
    'labor_cost',           v_labor,
    'material_cost',        v_material,
    'other_cost',           v_other,
    'total_cost',           v_total,
    'profit',               v_profit,
    'margin_percentage',    v_margin,
    'revenue_source',       v_revenue_src,
    'invoice_id',           v_invoice_id,
    'issued_invoice_count', v_issued,
    'credited_amount',      v_credited,
    'time_log_count',       v_log_count,
    'material_line_count',  v_mat_lines,
    'other_line_count',     v_other_lines,
    'offer_line_count',     v_offer_lines,
    'total_hours',          v_hours
  );
END;
$function$;

-- ---------- 2. snapshot_work_order_profit: ingen dublet-snapshots ----------
CREATE OR REPLACE FUNCTION public.snapshot_work_order_profit(p_work_order_id uuid, p_source text DEFAULT 'manual'::text)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_calc        JSONB;
  v_snapshot_id UUID;
  v_last        RECORD;
BEGIN
  v_calc := calculate_work_order_profit(p_work_order_id);

  SELECT id, revenue, total_cost INTO v_last
    FROM work_order_profit
   WHERE work_order_id = p_work_order_id
   ORDER BY created_at DESC
   LIMIT 1;
  IF v_last.id IS NOT NULL
     AND v_last.revenue IS NOT DISTINCT FROM (v_calc->>'revenue')::numeric
     AND v_last.total_cost IS NOT DISTINCT FROM (v_calc->>'total_cost')::numeric THEN
    RETURN v_last.id;  -- 00222: uændrede tal → intet nyt snapshot
  END IF;

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
$function$;

-- ---------- 3. faktura-trigger: også status/annullering/kreditnota ----------
CREATE OR REPLACE FUNCTION public.trg_invoice_snapshot_profit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_wo UUID;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.work_order_id IS NOT NULL
     AND OLD.work_order_id IS DISTINCT FROM NEW.work_order_id THEN
    PERFORM snapshot_work_order_profit(OLD.work_order_id, 'invoice_created');
  END IF;
  -- Kreditnota: ingen work_order_id — arbejdsordren findes via originalen
  v_wo := NEW.work_order_id;
  IF v_wo IS NULL AND NEW.credit_of_invoice_id IS NOT NULL THEN
    SELECT work_order_id INTO v_wo FROM invoices WHERE id = NEW.credit_of_invoice_id;
  END IF;
  IF v_wo IS NULL THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.total_amount, 0) = 0 THEN
    -- Vent på at totalerne er udfyldt (create_invoice_from_work_order indsætter med 0). Kreditnotaer er negative.
    RETURN NEW;
  END IF;
  -- Uændrede tal giver intet nyt snapshot (snapshot_work_order_profit sammenligner med seneste)
  PERFORM snapshot_work_order_profit(v_wo, 'invoice_created');
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_invoices_snapshot_profit ON public.invoices;
CREATE TRIGGER trg_invoices_snapshot_profit
  AFTER INSERT OR UPDATE OF total_amount, work_order_id, status, voided_at, invoice_type ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.trg_invoice_snapshot_profit();

-- ---------- 4. kost-linjer på en udført arbejdsordre → nyt snapshot ----------
CREATE OR REPLACE FUNCTION public.trg_cost_rows_snapshot_profit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ids UUID[];
  v_id  UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_ids := ARRAY[NEW.work_order_id];
  ELSIF TG_OP = 'DELETE' THEN
    v_ids := ARRAY[OLD.work_order_id];
  ELSE
    v_ids := ARRAY[OLD.work_order_id, NEW.work_order_id];
  END IF;
  FOR v_id IN SELECT DISTINCT x FROM unnest(v_ids) AS x WHERE x IS NOT NULL LOOP
    IF EXISTS (SELECT 1 FROM work_orders WHERE id = v_id AND status = 'done') THEN
      PERFORM snapshot_work_order_profit(v_id, 'recompute');
    END IF;
  END LOOP;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.trg_cost_rows_snapshot_profit() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_time_logs_cost_snapshot_profit ON public.time_logs;
CREATE TRIGGER trg_time_logs_cost_snapshot_profit
  AFTER INSERT OR DELETE OR UPDATE OF work_order_id, end_time, hours, cost_amount, sale_amount, billable, approval_status
  ON public.time_logs
  FOR EACH ROW EXECUTE FUNCTION public.trg_cost_rows_snapshot_profit();

DROP TRIGGER IF EXISTS trg_case_materials_cost_snapshot_profit ON public.case_materials;
CREATE TRIGGER trg_case_materials_cost_snapshot_profit
  AFTER INSERT OR DELETE OR UPDATE OF work_order_id, quantity, unit_cost, unit_sales_price, total_cost, total_sales_price, billable
  ON public.case_materials
  FOR EACH ROW EXECUTE FUNCTION public.trg_cost_rows_snapshot_profit();

DROP TRIGGER IF EXISTS trg_case_other_costs_cost_snapshot_profit ON public.case_other_costs;
CREATE TRIGGER trg_case_other_costs_cost_snapshot_profit
  AFTER INSERT OR DELETE OR UPDATE OF work_order_id, quantity, unit_cost, unit_sales_price, total_cost, total_sales_price, billable
  ON public.case_other_costs
  FOR EACH ROW EXECUTE FUNCTION public.trg_cost_rows_snapshot_profit();

COMMIT;
