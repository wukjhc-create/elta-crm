-- =====================================================
-- Migration 00248: ukendt materialekost kan gemmes (NULL), og den tælles aldrig som 0
--
-- STATUS: STAGING. Prod kræver særskilt godkendelse (Henrik). Runbook: docs/runbooks/mp-00248-case-material-unknown-cost.md
--
-- Baggrund: case_materials.unit_cost var NOT NULL DEFAULT 0, så en ukendt kost blev gemt som 0,00 og talte som en vare
-- der intet kostede. Avance og DB blev for høje uden at nogen kunne se det.
--
-- Regel: KENDT KOST = endeligt tal (også 0). UKENDT KOST = NULL. Aldrig NULL → 0 i kost, avance eller rapporter.
--
-- Ændringer:
--  1. case_materials.unit_cost: nullable, ingen standardværdi. CHECK afviser NaN (NUMERIC(12,2) tillader ellers 'NaN').
--     total_cost er uændret: GENERATED ALWAYS AS (quantity * unit_cost) giver selv NULL, når unit_cost er NULL.
--     Ingen tabelomskrivning og ingen data ændres.
--  2. work_order_profit.material_cost/total_cost/profit/margin_percentage: nullable, ingen standardværdi. Et snapshot kan nu
--     sige "ukendt". Uden det ville et materiale uden kost på en udført ordre få hele indsættelsen til at fejle
--     (trg_cost_rows_snapshot_profit) eller kræve et falsk tal.
--  3. calculate_work_order_profit: mangler én linjes kost, er material_cost, total_cost, profit og margin_percentage NULL.
--     Nye nøgler: material_cost_known (summen af de kendte), material_unknown_line_count, cost_complete. Omsætning og
--     timekost beregnes som før. COALESCE(total_cost, unit_cost * quantity, 0) er væk for materialer.
--  4. snapshot_work_order_profit: nyt snapshot også når kun det kendte beløb eller antal ukendte linjer ændres.
--  5. Kostkolonnerne kan ikke læses direkte via API'et (som 00192/00201): authenticated mister tabel-SELECT og får
--     kolonne-SELECT på alle øvrige kolonner. Ingen bruger kan SELECT, filtrere, sortere eller joine på unit_cost/
--     total_cost, uanset rolle; SELECT * afvises. App'en læser kosten med admin-klienten bag den effektive rettighed
--     materials.view.cost_prices og kun for rækker brugerens egen klient har returneret (lib/materials/case-material-costs).
--     Dermed er NULL mod kendt kost heller ikke en sidekanal.
--  6. Kosten kan kun SÆTTES af den, der må se den (effektiv rettighed materials.view.cost_prices, ingen rå rolle):
--     trigger case_materials_cost_write_guard (SECURITY INVOKER, som 00150). For en API-session (anon/authenticated)
--     uden rettigheden: INSERT med unit_cost ≠ NULL afvises; UPDATE hvor unit_cost står i SET afvises UANSET værdi
--     (en sammenligning med den gemte kost ville gøre afvisning/accept til et orakel). Fejlteksten indeholder ingen
--     beløb. total_cost er genereret og kan ikke skrives. service_role/postgres (admin-klient, definer-triggere) gates
--     ikke — de er app'ens egne, gatede stier. Række-adgangen til skrivning: se 8.
--  7. work_order_profit (avance/kost pr. ordre) læses efter EFFEKTIVE rettigheder i stedet for rå user_role() (00192):
--     economy.cost_prices OG materials.view.cost_prices (snapshottet indeholder både time- og materialekost; med kun
--     den ene kunne den anden regnes ud) OG ordren skal være synlig for brugeren (work_orders-RLS, 00242). Samme
--     politiknavn (scripts/rls/write-matrix.ts SELECT_REPLACED). snapshot_work_order_profit mister EXECUTE for
--     klienter (kaldes kun af admin-klienten og af SECURITY DEFINER-triggere).
--  8. case_materials INSERT/UPDATE/DELETE efter effektive rettigheder (materials.add_to_case / .edit / .delete) OG
--     sags-scope (samme udtryk som læsepolitikken 00242) i stedet for rå user_role() (00173). Arbejdsordren skal høre
--     til sagen. case_id kan ikke ændres via API'et (trigger case_materials_case_lock_guard). Samme politiknavne.
--  Uændret: trg_profit_snapshot_flag_low (NULL opfylder hverken < 15 eller >= 15: intet flag, ingen margin_alert),
--           case_other_costs, case_materials' læsepolitik, INSERT/UPDATE/DELETE-grants.
--
-- Data: ingen konvertering. Prod 2026-11-05: 4 rækker, 0 med unit_cost = 0, 0 work_order_profit-rækker.
-- Rækkefølge: PUSH → MIGRATION. Gammel kode læser kosten med bruger-klienten og fejler efter punkt 5; ny kode læser den
-- aldrig med bruger-klienten og virker på begge skemaer. Indtil migrationen er kørt, afviser databasen en montør-linje
-- uden kost (NOT NULL): handlingen fejler synligt, intet gemmes som 0.
-- Rollback: docs/runbooks/mp-00248-rollback.sql (afviser, hvis der findes NULL-rækker; intet sættes stille til 0).
-- =====================================================

BEGIN;

-- ---------- 1. case_materials ----------
ALTER TABLE public.case_materials ALTER COLUMN unit_cost DROP DEFAULT;
ALTER TABLE public.case_materials ALTER COLUMN unit_cost DROP NOT NULL;
ALTER TABLE public.case_materials
  ADD CONSTRAINT case_materials_unit_cost_finite CHECK (unit_cost IS NULL OR unit_cost <> 'NaN'::numeric);

COMMENT ON COLUMN public.case_materials.unit_cost IS
  'Kostpris pr. enhed. NULL = ukendt (aldrig det samme som 0). 0 = kendt kost på 0 kr. Negativ = returlinje fra leverandør-kreditnota.';

-- ---------- 2. work_order_profit ----------
ALTER TABLE public.work_order_profit
  ALTER COLUMN material_cost DROP DEFAULT,
  ALTER COLUMN material_cost DROP NOT NULL,
  ALTER COLUMN total_cost DROP DEFAULT,
  ALTER COLUMN total_cost DROP NOT NULL,
  ALTER COLUMN profit DROP DEFAULT,
  ALTER COLUMN profit DROP NOT NULL,
  ALTER COLUMN margin_percentage DROP DEFAULT,
  ALTER COLUMN margin_percentage DROP NOT NULL;

COMMENT ON COLUMN public.work_order_profit.profit IS
  'NULL = kan ikke beregnes, fordi mindst ét materiale mangler kostpris (details.cost_complete = false). Aldrig 0 i stedet.';

-- ---------- 3. calculate_work_order_profit ----------
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
  v_mat_unknown   INTEGER       := 0;     -- 00248: linjer uden kendt kost
  v_mat_known     NUMERIC(12,2) := 0;     -- 00248: summen af de kendte materialekoster
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
  -- 00248: total_cost er genereret og NULL ved ukendt kost. SUM springer NULL over, så antallet tælles for sig
  SELECT COALESCE(SUM(total_cost), 0)::numeric(12,2), COUNT(*), COUNT(*) FILTER (WHERE total_cost IS NULL)
    INTO v_mat_known, v_mat_lines, v_mat_unknown
    FROM case_materials
   WHERE work_order_id = p_work_order_id;
  v_material := v_mat_known;

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
    v_mat_known := v_material;
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

  IF v_mat_unknown > 0 THEN
    -- 00248: mindst én kost er ukendt → ingen samlet kost, avance eller margin. Omsætning og timekost står stadig.
    v_material := NULL;
    v_total    := NULL;
    v_profit   := NULL;
    v_margin   := NULL;
  ELSE
    v_total  := ROUND((v_labor + v_material + v_other)::numeric, 2);
    v_profit := ROUND((v_revenue - v_total)::numeric, 2);
    IF v_revenue > 0 THEN
      v_margin := ROUND((v_profit / v_revenue * 100)::numeric, 2);
    END IF;
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
    'total_hours',          v_hours,
    'material_cost_known',  v_mat_known,
    'material_unknown_line_count', v_mat_unknown,
    'cost_complete',        v_mat_unknown = 0
  );
END;
$function$;

-- ---------- 4. snapshot_work_order_profit ----------
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

  SELECT id, revenue, total_cost, details INTO v_last
    FROM work_order_profit
   WHERE work_order_id = p_work_order_id
   ORDER BY created_at DESC
   LIMIT 1;
  IF v_last.id IS NOT NULL
     AND v_last.revenue IS NOT DISTINCT FROM (v_calc->>'revenue')::numeric
     AND v_last.total_cost IS NOT DISTINCT FROM (v_calc->>'total_cost')::numeric
     -- 00248: to snapshots med ukendt total er kun ens, hvis det kendte beløb og antallet af ukendte linjer er ens
     AND COALESCE((v_last.details->>'material_cost_known')::numeric, (v_last.details->>'material_cost')::numeric)
         IS NOT DISTINCT FROM (v_calc->>'material_cost_known')::numeric
     AND COALESCE((v_last.details->>'material_unknown_line_count')::integer, 0)
         IS NOT DISTINCT FROM (v_calc->>'material_unknown_line_count')::integer THEN
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

-- ---------- 5. Kostkolonnerne kan ikke læses direkte ----------
DO $$
DECLARE
  cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position) INTO cols
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'case_materials'
     AND column_name NOT IN ('unit_cost', 'total_cost');
  IF cols IS NULL THEN
    RAISE EXCEPTION '00248: case_materials findes ikke';
  END IF;
  -- REVOKE på tabellen fjerner også eventuelle kolonne-SELECT; derefter gives de ufarlige kolonner tilbage
  REVOKE SELECT ON public.case_materials FROM anon, authenticated;
  EXECUTE format('GRANT SELECT (%s) ON public.case_materials TO authenticated', cols);
  IF has_column_privilege('authenticated', 'public.case_materials', 'unit_cost', 'SELECT')
     OR has_column_privilege('authenticated', 'public.case_materials', 'total_cost', 'SELECT') THEN
    RAISE EXCEPTION '00248: kostkolonnerne kan stadig læses af authenticated';
  END IF;
END $$;

-- ---------- 6. Kosten kan kun sættes med kost-retten ----------
-- SECURITY INVOKER (default): current_user er den kaldende rolle. Som DEFINER ville current_user altid være ejeren.
CREATE FUNCTION public.case_materials_cost_write_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = public, pg_temp
AS $function$
BEGIN
  IF current_user IN ('anon', 'authenticated')
     AND NOT COALESCE(public.user_has_permission('materials.view.cost_prices'), false) THEN
    -- INSERT: kun en ukendt kost (NULL). UPDATE OF unit_cost: afvist uanset værdi — ingen sammenligning med den gemte kost.
    IF TG_OP <> 'INSERT' OR NEW.unit_cost IS NOT NULL THEN
      RAISE EXCEPTION 'case_materials: kostpris kan kun sættes eller ændres med rettigheden materials.view.cost_prices'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
-- EXECUTE kontrolleres kun ved CREATE TRIGGER, ikke når triggeren fyrer → ingen klient behøver den
REVOKE ALL ON FUNCTION public.case_materials_cost_write_guard() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_case_materials_cost_write_guard_insert
  BEFORE INSERT ON public.case_materials
  FOR EACH ROW EXECUTE FUNCTION public.case_materials_cost_write_guard();
-- UPDATE OF unit_cost fyrer, når kolonnen står i SET (også ved uændret værdi og ved upsert's DO UPDATE)
CREATE TRIGGER trg_case_materials_cost_write_guard_update
  BEFORE UPDATE OF unit_cost ON public.case_materials
  FOR EACH ROW EXECUTE FUNCTION public.case_materials_cost_write_guard();

-- ---------- 7. work_order_profit efter effektive rettigheder ----------
DO $guard$
BEGIN
  -- Forventet før: præcis én SELECT-politik for authenticated (00192's rå rolle-tjek), ingen skrive-politikker
  IF (SELECT array_agg(policyname::text ORDER BY policyname) FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'work_order_profit')
     IS DISTINCT FROM ARRAY['work_order_profit_select_cost_roles'] THEN
    RAISE EXCEPTION '00248: work_order_profit har uventede politikker — kontrollér før kørsel';
  END IF;
END
$guard$;

DROP POLICY work_order_profit_select_cost_roles ON public.work_order_profit;
CREATE POLICY work_order_profit_select_cost_roles ON public.work_order_profit
  FOR SELECT TO authenticated
  USING (
    (SELECT public.user_has_permission('economy.cost_prices'))
    AND (SELECT public.user_has_permission('materials.view.cost_prices'))
    -- sags-/ordre-scope: work_orders-RLS (00242) afgør, om ordren er synlig
    AND EXISTS (SELECT 1 FROM public.work_orders w WHERE w.id = work_order_profit.work_order_id)
  );

REVOKE EXECUTE ON FUNCTION public.snapshot_work_order_profit(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.snapshot_work_order_profit(uuid, text) TO service_role;

-- ---------- 8. case_materials-skrivning efter effektive rettigheder og sags-scope ----------
-- Før (00173): INSERT user_role() IN (admin, serviceleder, montør), UPDATE/DELETE user_role() IN (admin, serviceleder),
-- uden sags-scope. Efter: samme nøgler som app'en (materials.add_to_case / materials.edit / materials.delete) OG sagen
-- skal ligge i brugerens scope — samme udtryk som læsepolitikken (00242), så en skrive-ret aldrig rækker ud over
-- læse-scopet. En arbejdsordre på linjen skal høre til samme sag (og være synlig, work_orders-RLS). Samme politiknavne
-- (scripts/rls/write-matrix.ts: supersededBy 00248). Kost-værnet (§6) gælder oveni.
DO $guard$
DECLARE
  v_pols text[];
BEGIN
  SELECT array_agg(policyname::text || ':' || cmd ORDER BY policyname) INTO v_pols
    FROM pg_policies WHERE schemaname = 'public' AND tablename = 'case_materials';
  IF v_pols IS DISTINCT FROM ARRAY['case_materials_delete_role:DELETE', 'case_materials_insert_role:INSERT',
                                   'case_materials_select_scope:SELECT', 'case_materials_update_role:UPDATE'] THEN
    RAISE EXCEPTION '00248: case_materials har uventede politikker — kontrollér før kørsel';
  END IF;
  IF to_regprocedure('public.my_case_scope_ids()') IS NULL THEN
    RAISE EXCEPTION '00248: my_case_scope_ids() mangler (00240)';
  END IF;
END
$guard$;

DROP POLICY case_materials_insert_role ON public.case_materials;
CREATE POLICY case_materials_insert_role ON public.case_materials FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.user_has_permission('materials.add_to_case'))
    AND ((SELECT public.user_has_permission('cases.view.all')) OR case_id = ANY ((SELECT public.my_case_scope_ids())::uuid[]))
    AND (work_order_id IS NULL OR EXISTS (SELECT 1 FROM public.work_orders w
                                          WHERE w.id = case_materials.work_order_id AND w.case_id = case_materials.case_id))
  );

DROP POLICY case_materials_update_role ON public.case_materials;
CREATE POLICY case_materials_update_role ON public.case_materials FOR UPDATE TO authenticated
  USING (
    (SELECT public.user_has_permission('materials.edit'))
    AND ((SELECT public.user_has_permission('cases.view.all')) OR case_id = ANY ((SELECT public.my_case_scope_ids())::uuid[]))
  )
  WITH CHECK (
    (SELECT public.user_has_permission('materials.edit'))
    AND ((SELECT public.user_has_permission('cases.view.all')) OR case_id = ANY ((SELECT public.my_case_scope_ids())::uuid[]))
    AND (work_order_id IS NULL OR EXISTS (SELECT 1 FROM public.work_orders w
                                          WHERE w.id = case_materials.work_order_id AND w.case_id = case_materials.case_id))
  );

DROP POLICY case_materials_delete_role ON public.case_materials;
CREATE POLICY case_materials_delete_role ON public.case_materials FOR DELETE TO authenticated
  USING (
    (SELECT public.user_has_permission('materials.delete'))
    AND ((SELECT public.user_has_permission('cases.view.all')) OR case_id = ANY ((SELECT public.my_case_scope_ids())::uuid[]))
  );

-- Et materiale flyttes aldrig til en anden sag via API'et (app'en har intet flow til det). RLS frasorterer først rækker
-- uden for scope, så afvisningen rammer kun synlige rækker; teksten nævner ingen sag.
CREATE FUNCTION public.case_materials_case_lock_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = public, pg_temp
AS $function$
BEGIN
  IF current_user IN ('anon', 'authenticated') AND NEW.case_id IS DISTINCT FROM OLD.case_id THEN
    RAISE EXCEPTION 'case_materials: et materiale kan ikke flyttes til en anden sag' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.case_materials_case_lock_guard() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_case_materials_case_lock
  BEFORE UPDATE OF case_id ON public.case_materials
  FOR EACH ROW EXECUTE FUNCTION public.case_materials_case_lock_guard();

NOTIFY pgrst, 'reload schema';

COMMIT;
