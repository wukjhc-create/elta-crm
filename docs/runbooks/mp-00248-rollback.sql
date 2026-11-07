-- Rollback af 00248. Sætter ALDRIG en ukendt kost til 0: findes der NULL-rækker, afvises rollback, og rækkerne skal først
-- have en kendt kost (eller slettes) efter en menneskelig gennemgang.
-- Funktionerne genskabes præcis som i 00222. Kode der skriver NULL, skal være rullet tilbage før denne fil køres.

BEGIN;

DO $guard$
DECLARE
  v_mat INTEGER;
  v_wop INTEGER;
BEGIN
  SELECT count(*) INTO v_mat FROM public.case_materials WHERE unit_cost IS NULL;
  SELECT count(*) INTO v_wop FROM public.work_order_profit
   WHERE material_cost IS NULL OR total_cost IS NULL OR profit IS NULL OR margin_percentage IS NULL;
  IF v_mat > 0 OR v_wop > 0 THEN
    RAISE EXCEPTION '00248-rollback afvist: % materiale(r) med ukendt kost og % snapshot(s) med ukendt avance. Gennemgå dem først; intet sættes stille til 0.', v_mat, v_wop;
  END IF;
END
$guard$;

-- 8 tilbage: skrive-politikkerne præcis som i 00173 (rå rolle, uden sags-scope) og ingen sags-lås
DROP TRIGGER IF EXISTS trg_case_materials_case_lock ON public.case_materials;
DROP FUNCTION IF EXISTS public.case_materials_case_lock_guard();
DROP POLICY IF EXISTS case_materials_insert_role ON public.case_materials;
DROP POLICY IF EXISTS case_materials_update_role ON public.case_materials;
DROP POLICY IF EXISTS case_materials_delete_role ON public.case_materials;
CREATE POLICY case_materials_insert_role ON public.case_materials FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'montør'));
CREATE POLICY case_materials_update_role ON public.case_materials FOR UPDATE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder')) WITH CHECK (public.user_role() IN ('admin', 'serviceleder'));
CREATE POLICY case_materials_delete_role ON public.case_materials FOR DELETE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder'));

-- 7 tilbage: work_order_profit efter rå rolle som i 00192. Snapshot-funktionen havde før 00248 standard-ACL (proacl NULL =
-- EXECUTE for PUBLIC, staging 2026-11-07) → PUBLIC får EXECUTE igen, så authenticated og anon kan som før
DROP POLICY IF EXISTS work_order_profit_select_cost_roles ON public.work_order_profit;
CREATE POLICY work_order_profit_select_cost_roles ON public.work_order_profit
  FOR SELECT TO authenticated
  USING (public.user_role() IN ('admin', 'serviceleder', 'bogholderi'));
GRANT EXECUTE ON FUNCTION public.snapshot_work_order_profit(uuid, text) TO PUBLIC;

-- 6 tilbage: skrive-værnet på kosten
DROP TRIGGER IF EXISTS trg_case_materials_cost_write_guard_insert ON public.case_materials;
DROP TRIGGER IF EXISTS trg_case_materials_cost_write_guard_update ON public.case_materials;
DROP FUNCTION IF EXISTS public.case_materials_cost_write_guard();

-- 5 tilbage: tabel-SELECT for authenticated som før (REVOKE fjerner kolonne-grantene, GRANT giver tabel-retten igen)
REVOKE SELECT ON public.case_materials FROM authenticated;
GRANT SELECT ON public.case_materials TO authenticated;

ALTER TABLE public.case_materials DROP CONSTRAINT IF EXISTS case_materials_unit_cost_finite;
ALTER TABLE public.case_materials ALTER COLUMN unit_cost SET DEFAULT 0;
ALTER TABLE public.case_materials ALTER COLUMN unit_cost SET NOT NULL;
COMMENT ON COLUMN public.case_materials.unit_cost IS NULL;

ALTER TABLE public.work_order_profit
  ALTER COLUMN material_cost SET DEFAULT 0,
  ALTER COLUMN material_cost SET NOT NULL,
  ALTER COLUMN total_cost SET DEFAULT 0,
  ALTER COLUMN total_cost SET NOT NULL,
  ALTER COLUMN profit SET DEFAULT 0,
  ALTER COLUMN profit SET NOT NULL,
  ALTER COLUMN margin_percentage SET DEFAULT 0,
  ALTER COLUMN margin_percentage SET NOT NULL;
COMMENT ON COLUMN public.work_order_profit.profit IS NULL;

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

NOTIFY pgrst, 'reload schema';

COMMIT;
