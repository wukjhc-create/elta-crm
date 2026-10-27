-- =====================================================================================================================
-- 00242 — LÆSE-SCOPE for sags-nøglede børnetabeller + fakturaer (UDKAST — IKKE en migration; ligger bevidst uden for
-- supabase/migrations og må ikke anvendes uden Henriks særskilte godkendelse pr. miljø). KRÆVER 00240 (+ 00241).
-- Beslutninger (Henrik 2026-10-27): O1 arbejdsordrer · O2 opgaver · O5 skema-paritet · F1 fakturaer.
--
--   0. Paritet: customer_tasks.service_case_id (findes i prod+staging, men i INGEN migrationsfil) — idempotent, no-op
--      når kolonnen/FK'en/indekset er præcis som i prod (uuid NULL, FK → service_cases ON DELETE SET NULL, partielt indeks)
--      current_employee_id(): deterministisk (ældste aktive række — = appens scope-motor; før LIMIT 1 uden ORDER BY)
--   1. work_orders: work_orders.view.all → alle · alle AKTIVE ser ordrer tildelt deres egen medarbejderrække · roller MED
--      work_orders.view.assigned (montør/Elektriker) ser KUN egne · roller UDEN work_orders.view.* (salg, bogholderi)
--      ser ordrer på sager i deres sags-scope (bogholderi: cases.view.all → alle, også sagsløse)
--   2. case_notes / case_materials / case_other_costs / service_case_attachments → sags-scope
--   3. customer_tasks: tildelt/oprettet af mig · customers.view.all (salg/bogholderi/admin/serviceleder — som i dag via
--      kundefanen) · opgaver på en sag i mit sags-scope (sagens opgavefane). Montør ser IKKE en global opgaveliste.
--   4. invoices / invoice_payments / invoice_lines (F1): invoices.view.all → alle · invoices.view.own_cases → kun fakturaer
--      på sager i mit effektive sags-scope (sagsløse kun med view.all) · linjer/betalinger følger fakturaen.
--      can_view_case_finance() følger samme regel (bruges af andre politikker/kald).
-- Skrive-politikker er uændrede. time_logs (can_view_time_log: salg = created_by) er IKKE med — se forslaget.
-- =====================================================================================================================
BEGIN;

-- Forudsætninger
DO $guard$
BEGIN
  IF to_regprocedure('public.my_case_scope_ids()') IS NULL OR to_regprocedure('public.my_customer_scope_ids()') IS NULL THEN
    RAISE EXCEPTION '00242: 00240-hjælperne mangler — anvend 00240 først';
  END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND cmd IN ('SELECT', 'ALL') AND 'authenticated' = ANY (roles)
      AND tablename IN ('work_orders', 'case_notes', 'case_materials', 'case_other_costs', 'service_case_attachments',
                        'customer_tasks', 'invoices', 'invoice_payments', 'invoice_lines')) <> 9 THEN
    RAISE EXCEPTION '00242: uventet antal SELECT/ALL-politikker for authenticated — kontrollér før kørsel';
  END IF;
  -- Paritet: findes kolonnen, skal den være præcis uuid (ellers stop — ingen stille typeændring)
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'customer_tasks'
             AND column_name = 'service_case_id' AND udt_name <> 'uuid') THEN
    RAISE EXCEPTION '00242: customer_tasks.service_case_id har uventet type';
  END IF;
END
$guard$;

-- 0a. customer_tasks.service_case_id — paritet med prod (no-op hvor den findes)
ALTER TABLE public.customer_tasks ADD COLUMN IF NOT EXISTS service_case_id uuid;
DO $fk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.customer_tasks'::regclass AND contype = 'f'
                 AND conname = 'customer_tasks_service_case_id_fkey') THEN
    ALTER TABLE public.customer_tasks ADD CONSTRAINT customer_tasks_service_case_id_fkey
      FOREIGN KEY (service_case_id) REFERENCES public.service_cases(id) ON DELETE SET NULL;
  ELSIF (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'public.customer_tasks'::regclass
         AND conname = 'customer_tasks_service_case_id_fkey')
        <> 'FOREIGN KEY (service_case_id) REFERENCES service_cases(id) ON DELETE SET NULL' THEN
    RAISE EXCEPTION '00242: customer_tasks_service_case_id_fkey afviger fra prod-definitionen';
  END IF;
END
$fk$;
CREATE INDEX IF NOT EXISTS idx_customer_tasks_service_case ON public.customer_tasks (service_case_id) WHERE service_case_id IS NOT NULL;

-- 0b. current_employee_id(): deterministisk (= getWorkOrderEmployeeScope: ældste aktive række). Samme signatur/ACL.
CREATE OR REPLACE FUNCTION public.current_employee_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.id FROM public.employees e WHERE e.profile_id = auth.uid() AND e.active ORDER BY e.created_at, e.id LIMIT 1
$$;

-- 1. work_orders (O1)
DROP POLICY IF EXISTS work_orders_select_authenticated ON public.work_orders;
CREATE POLICY work_orders_select_scope ON public.work_orders
  FOR SELECT TO authenticated
  USING (
    (SELECT public.user_has_permission('work_orders.view.all'))
    -- egne ordrer: kræver en læsenøgle (inaktiv/manglende profil → ingen nøgler → intet; current_employee_id() ser ikke profilen)
    OR (((SELECT public.user_has_permission('work_orders.view.assigned')) OR (SELECT public.user_has_permission('cases.view.assigned')))
        AND assigned_employee_id = (SELECT public.current_employee_id()))
    OR (NOT (SELECT public.user_has_permission('work_orders.view.assigned')) AND (
      (SELECT public.user_has_permission('cases.view.all'))
      OR (case_id IS NOT NULL AND case_id = ANY ((SELECT public.my_case_scope_ids())::uuid[]))))
  );

-- 2. sags-nøglede tabeller
DROP POLICY IF EXISTS case_notes_select ON public.case_notes;
CREATE POLICY case_notes_select_scope ON public.case_notes FOR SELECT TO authenticated
  USING ((SELECT public.user_has_permission('cases.view.all')) OR case_id = ANY ((SELECT public.my_case_scope_ids())::uuid[]));
DROP POLICY IF EXISTS case_materials_select_authenticated ON public.case_materials;
CREATE POLICY case_materials_select_scope ON public.case_materials FOR SELECT TO authenticated
  USING ((SELECT public.user_has_permission('cases.view.all')) OR case_id = ANY ((SELECT public.my_case_scope_ids())::uuid[]));
DROP POLICY IF EXISTS case_other_costs_select_authenticated ON public.case_other_costs;
CREATE POLICY case_other_costs_select_scope ON public.case_other_costs FOR SELECT TO authenticated
  USING ((SELECT public.user_has_permission('cases.view.all')) OR case_id = ANY ((SELECT public.my_case_scope_ids())::uuid[]));
DROP POLICY IF EXISTS service_case_attachments_select_authenticated ON public.service_case_attachments;
CREATE POLICY service_case_attachments_select_scope ON public.service_case_attachments FOR SELECT TO authenticated
  USING ((SELECT public.user_has_permission('cases.view.all')) OR service_case_id = ANY ((SELECT public.my_case_scope_ids())::uuid[]));

-- 3. customer_tasks (O2)
DROP POLICY IF EXISTS customer_tasks_select_authenticated ON public.customer_tasks;
CREATE POLICY customer_tasks_select_scope ON public.customer_tasks
  FOR SELECT TO authenticated
  USING (
    -- egne opgaver: kræver tasks.menu (alle aktive roller) — inaktiv/manglende profil ser intet
    ((SELECT public.user_has_permission('tasks.menu')) AND (assigned_to = (SELECT auth.uid()) OR created_by = (SELECT auth.uid())))
    OR (SELECT public.user_has_permission('customers.view.all'))
    OR (service_case_id IS NOT NULL AND service_case_id = ANY ((SELECT public.my_case_scope_ids())::uuid[]))
  );

-- 4. fakturaer (F1)
CREATE OR REPLACE FUNCTION public.can_view_case_finance(p_case_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.user_has_permission('invoices.view.all')
      OR (public.user_has_permission('invoices.view.own_cases') AND p_case_id IS NOT NULL
          AND (public.user_has_permission('cases.view.all') OR p_case_id = ANY (public.my_case_scope_ids())))
$$;

DROP POLICY IF EXISTS invoices_select_by_role ON public.invoices;
CREATE POLICY invoices_select_scope ON public.invoices
  FOR SELECT TO authenticated
  USING (
    (SELECT public.user_has_permission('invoices.view.all'))
    OR ((SELECT public.user_has_permission('invoices.view.own_cases')) AND case_id IS NOT NULL AND (
      (SELECT public.user_has_permission('cases.view.all'))
      OR case_id = ANY ((SELECT public.my_case_scope_ids())::uuid[])))
  );
DROP POLICY IF EXISTS invoice_payments_select_by_role ON public.invoice_payments;
CREATE POLICY invoice_payments_select_scope ON public.invoice_payments
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_payments.invoice_id));
DROP POLICY IF EXISTS invoice_lines_select_authenticated ON public.invoice_lines;
CREATE POLICY invoice_lines_select_scope ON public.invoice_lines
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_lines.invoice_id));

-- 5. indeks til politikkerne
CREATE INDEX IF NOT EXISTS idx_customer_tasks_assigned_to ON public.customer_tasks (assigned_to);
CREATE INDEX IF NOT EXISTS idx_work_orders_assigned_employee ON public.work_orders (assigned_employee_id);

NOTIFY pgrst, 'reload schema';
COMMIT;

-- =====================================================================================================================
-- ROLLBACK (én transaktion; genskaber de brede SELECT-politikker og den rolle-baserede can_view_case_finance fra 00161.
-- Rører IKKE anon. Paritetskolonnen/-indeks og den deterministiske current_employee_id() bliver stående — de er korrekte.)
-- ---------------------------------------------------------------------------------------------------------------------
-- BEGIN;
-- DROP POLICY IF EXISTS work_orders_select_scope ON public.work_orders;
-- CREATE POLICY work_orders_select_authenticated ON public.work_orders FOR SELECT TO authenticated USING (true);
-- DROP POLICY IF EXISTS case_notes_select_scope ON public.case_notes;
-- CREATE POLICY case_notes_select ON public.case_notes FOR SELECT TO authenticated USING (true);
-- DROP POLICY IF EXISTS case_materials_select_scope ON public.case_materials;
-- CREATE POLICY case_materials_select_authenticated ON public.case_materials FOR SELECT TO authenticated USING (true);
-- DROP POLICY IF EXISTS case_other_costs_select_scope ON public.case_other_costs;
-- CREATE POLICY case_other_costs_select_authenticated ON public.case_other_costs FOR SELECT TO authenticated USING (true);
-- DROP POLICY IF EXISTS service_case_attachments_select_scope ON public.service_case_attachments;
-- CREATE POLICY service_case_attachments_select_authenticated ON public.service_case_attachments FOR SELECT TO authenticated USING (true);
-- DROP POLICY IF EXISTS customer_tasks_select_scope ON public.customer_tasks;
-- CREATE POLICY customer_tasks_select_authenticated ON public.customer_tasks FOR SELECT TO authenticated USING (true);
-- DROP POLICY IF EXISTS invoices_select_scope ON public.invoices;
-- CREATE POLICY invoices_select_by_role ON public.invoices FOR SELECT TO authenticated USING (public.can_view_case_finance(case_id));
-- DROP POLICY IF EXISTS invoice_payments_select_scope ON public.invoice_payments;
-- CREATE POLICY invoice_payments_select_by_role ON public.invoice_payments FOR SELECT TO authenticated
--   USING (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_payments.invoice_id AND public.can_view_case_finance(i.case_id)));
-- DROP POLICY IF EXISTS invoice_lines_select_scope ON public.invoice_lines;
-- CREATE POLICY invoice_lines_select_authenticated ON public.invoice_lines FOR SELECT TO authenticated USING (true);
-- CREATE OR REPLACE FUNCTION public.can_view_case_finance(p_case_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
--   SET search_path = public AS $$ SELECT CASE public.user_role() WHEN 'admin' THEN true WHEN 'serviceleder' THEN true
--   WHEN 'bogholderi' THEN true WHEN 'salg' THEN p_case_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.service_cases s
--   WHERE s.id = p_case_id AND s.created_by = auth.uid()) ELSE false END $$;
-- NOTIFY pgrst, 'reload schema';
-- COMMIT;
-- =====================================================================================================================
