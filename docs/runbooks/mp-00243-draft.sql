-- =====================================================================
-- 00243: time_logs følger effektive rettigheder (rolle ∪ grants − revokes) i stedet for rå rolle — uden at udvide nogen standardrolle
-- Forslag: docs/runbooks/mp-00243-time-logs-permission-scope.md. Kræver Henriks godkendelse pr. miljø.
-- Kun de to hjælpefunktioner udskiftes; politikkerne (00208) kalder dem uændret. CREATE OR REPLACE bevarer ACL.
-- =====================================================================
BEGIN;

DO $guard$
BEGIN
  IF to_regprocedure('public.current_employee_id()') IS NULL
     OR to_regprocedure('public.user_has_permission(text)') IS NULL THEN
    RAISE EXCEPTION '00243: forudsætninger (00238/00240/00242) mangler';
  END IF;
  IF (SELECT count(*) FROM public.permission_catalog WHERE permission IN
      ('time_logs.view.all', 'time_logs.view.own', 'time_logs.create', 'time_logs.edit.own', 'time_logs.edit.all', 'invoices.view.own_cases')) <> 6 THEN
    RAISE EXCEPTION '00243: rettighedsnøgler mangler i permission_catalog';
  END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'time_logs') <> 3
     OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'time_logs'
                    AND policyname = 'time_logs_select_by_scope' AND qual = 'can_view_time_log(employee_id, work_order_id)') THEN
    RAISE EXCEPTION '00243: uventede time_logs-politikker — kontrollér før kørsel';
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.can_view_time_log(p_employee_id uuid, p_work_order_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.user_has_permission('time_logs.view.all')
    OR (public.user_has_permission('time_logs.view.own') AND public.current_employee_id() IS NOT NULL AND (
          p_employee_id = public.current_employee_id()
          OR EXISTS (SELECT 1 FROM public.work_orders w
                      WHERE w.id = p_work_order_id AND w.assigned_employee_id = public.current_employee_id())))
    -- salg (faktura-nøglen): kun arbejdsordrer på sager brugeren selv har OPRETTET — præcis som 00161 (ingen udvidelse).
    -- At gå til hele sags-scopet (F1: også tildelte/D4-sager) er en særskilt beslutning for Henrik.
    OR (public.user_has_permission('invoices.view.own_cases') AND EXISTS (
          SELECT 1 FROM public.work_orders w JOIN public.service_cases s ON s.id = w.case_id
           WHERE w.id = p_work_order_id AND s.created_by = auth.uid()))
$$;

CREATE OR REPLACE FUNCTION public.can_write_time_log(p_employee_id uuid, p_work_order_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.user_has_permission('time_logs.edit.all')
    OR ((public.user_has_permission('time_logs.create') OR public.user_has_permission('time_logs.edit.own'))
        AND public.current_employee_id() IS NOT NULL
        AND p_employee_id = public.current_employee_id()
        AND EXISTS (SELECT 1 FROM public.work_orders w
                     WHERE w.id = p_work_order_id AND w.assigned_employee_id = public.current_employee_id()))
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
