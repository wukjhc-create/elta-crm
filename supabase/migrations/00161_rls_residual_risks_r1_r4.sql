-- =====================================================================
-- 00161: Luk rest-risici R1–R4 fra 00160 (mindste privilegium)
-- =====================================================================
-- R1  invoices / invoice_payments — salg maatte laese ALLE fakturaer.
--     Besluttet model (SPRINT_7A_RBAC_PERMISSIONS_SCOPE_ANALYSIS §scope 'own_cases'):
--     salg ser kun fakturaer paa sager hvor service_cases.created_by = brugeren.
--     admin/serviceleder/bogholderi (invoices.view.all) ser alt. Betalinger foelger fakturaen.
--     Kundelistens betalingsoversigt (v_customer_payment_summary / v_customers_with_payment_summary)
--     er security_invoker og afgraenses derfor automatisk.
-- R2  time_logs — alle indloggede kunne laese alt.
--     Model = appens eksisterende scope (Sprint 7E, src/lib/auth/case-scope.ts):
--       admin/serviceleder/bogholderi (time_logs.view.all): alt
--       montør (view.own): egne registreringer + registreringer paa arbejdsordrer tildelt montørens
--                          medarbejder (employees.profile_id = bruger, active)
--       salg: registreringer paa egne sager (samme scope som R1; sags-oekonomi-stien laeser dem)
--     Skriv: admin/serviceleder; montør kun paa egen medarbejder OG egen arbejdsordre (som app-valideringen).
-- R3  supplier_credentials — krypterede hemmeligheder var laesbare for alle indloggede.
--     Kolonne-grants: authenticated maa kun laese ikke-hemmelige kolonner (metadata til admin-UI og
--     tilbuds-embed id/credential_type/is_active). Hemmeligheder kun via service-role
--     (src/lib/services/supplier-credential-secrets.ts). anon mister al adgang.
-- R4  v_recent_audit_logs koerte med ejerens rettigheder og omgik RLS paa audit_logs
--     (enhver indlogget kunne laese hele audit-loggen). -> security_invoker.
--
-- FORUDSAETNING (R3): koden der ikke laengere laeser hemmelige kolonner med brugerklienten skal vaere
-- deployet FOER denne migration (den er bagudkompatibel og kan deployes alene).
--
-- ROLLBACK
--   BEGIN;
--   DROP POLICY IF EXISTS invoices_select_by_role ON public.invoices;
--   CREATE POLICY invoices_select_by_role ON public.invoices FOR SELECT TO authenticated
--     USING (public.user_role() IN ('admin','serviceleder','bogholderi','salg'));
--   DROP POLICY IF EXISTS invoice_payments_select_by_role ON public.invoice_payments;
--   CREATE POLICY invoice_payments_select_by_role ON public.invoice_payments FOR SELECT TO authenticated
--     USING (public.user_role() IN ('admin','serviceleder','bogholderi','salg'));
--   DROP POLICY IF EXISTS time_logs_select_by_scope ON public.time_logs;
--   DROP POLICY IF EXISTS time_logs_insert_by_scope ON public.time_logs;
--   DROP POLICY IF EXISTS time_logs_update_by_scope ON public.time_logs;
--   CREATE POLICY time_logs_select_auth ON public.time_logs FOR SELECT TO authenticated USING (true);
--   CREATE POLICY time_logs_insert_by_role ON public.time_logs FOR INSERT TO authenticated
--     WITH CHECK (public.user_role() IN ('admin','serviceleder','montør'));
--   CREATE POLICY time_logs_update_by_role ON public.time_logs FOR UPDATE TO authenticated
--     USING (public.user_role() IN ('admin','serviceleder','montør')) WITH CHECK (public.user_role() IN ('admin','serviceleder','montør'));
--   GRANT SELECT ON public.supplier_credentials TO authenticated, anon;
--   ALTER VIEW public.v_recent_audit_logs RESET (security_invoker);
--   DROP FUNCTION IF EXISTS public.can_view_case_finance(uuid);
--   DROP FUNCTION IF EXISTS public.can_view_time_log(uuid, uuid);
--   DROP FUNCTION IF EXISTS public.can_write_time_log(uuid, uuid);
--   DROP FUNCTION IF EXISTS public.current_employee_id();
--   NOTIFY pgrst, 'reload schema';
--   COMMIT;
--
-- KOER IKKE MOD PRODUCTION uden eksplicit approval. Staging: npm run harness:migrate-staging -- 00161
-- Verifikation: npm run harness:pilot-roles (staging) / npm run prod:role-policies (read-only)
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------- hjaelpefunktioner
-- Aktiv medarbejder for den indloggede bruger (NULL hvis ingen).
CREATE OR REPLACE FUNCTION public.current_employee_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.id FROM public.employees e WHERE e.profile_id = auth.uid() AND e.active LIMIT 1
$$;

-- R1: maa brugeren se oekonomi (fakturaer/betalinger) knyttet til sagen?
CREATE OR REPLACE FUNCTION public.can_view_case_finance(p_case_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE public.user_role()
    WHEN 'admin' THEN true
    WHEN 'serviceleder' THEN true
    WHEN 'bogholderi' THEN true
    WHEN 'salg' THEN p_case_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.service_cases s WHERE s.id = p_case_id AND s.created_by = auth.uid())
    ELSE false
  END
$$;

-- R2: laes en tidsregistrering
CREATE OR REPLACE FUNCTION public.can_view_time_log(p_employee_id uuid, p_work_order_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE public.user_role()
    WHEN 'admin' THEN true
    WHEN 'serviceleder' THEN true
    WHEN 'bogholderi' THEN true
    WHEN 'montør' THEN public.current_employee_id() IS NOT NULL AND (
      p_employee_id = public.current_employee_id()
      OR EXISTS (SELECT 1 FROM public.work_orders w WHERE w.id = p_work_order_id AND w.assigned_employee_id = public.current_employee_id()))
    WHEN 'salg' THEN EXISTS (
      SELECT 1 FROM public.work_orders w JOIN public.service_cases s ON s.id = w.case_id
      WHERE w.id = p_work_order_id AND s.created_by = auth.uid())
    ELSE false
  END
$$;

-- R2: opret/ret en tidsregistrering
CREATE OR REPLACE FUNCTION public.can_write_time_log(p_employee_id uuid, p_work_order_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE public.user_role()
    WHEN 'admin' THEN true
    WHEN 'serviceleder' THEN true
    WHEN 'montør' THEN public.current_employee_id() IS NOT NULL
      AND p_employee_id = public.current_employee_id()
      AND EXISTS (SELECT 1 FROM public.work_orders w WHERE w.id = p_work_order_id AND w.assigned_employee_id = public.current_employee_id())
    ELSE false
  END
$$;

REVOKE ALL ON FUNCTION public.current_employee_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_view_case_finance(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_view_time_log(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_write_time_log(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_employee_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_case_finance(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_time_log(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_write_time_log(uuid, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------- R1
DROP POLICY IF EXISTS invoices_select_by_role ON public.invoices;
CREATE POLICY invoices_select_by_role ON public.invoices FOR SELECT TO authenticated
  USING (public.can_view_case_finance(case_id));

DROP POLICY IF EXISTS invoice_payments_select_by_role ON public.invoice_payments;
CREATE POLICY invoice_payments_select_by_role ON public.invoice_payments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_payments.invoice_id AND public.can_view_case_finance(i.case_id)));

-- ---------------------------------------------------------------- R2
DROP POLICY IF EXISTS time_logs_select_auth ON public.time_logs;
DROP POLICY IF EXISTS time_logs_insert_by_role ON public.time_logs;
DROP POLICY IF EXISTS time_logs_update_by_role ON public.time_logs;
DROP POLICY IF EXISTS time_logs_select_by_scope ON public.time_logs;
DROP POLICY IF EXISTS time_logs_insert_by_scope ON public.time_logs;
DROP POLICY IF EXISTS time_logs_update_by_scope ON public.time_logs;
CREATE POLICY time_logs_select_by_scope ON public.time_logs FOR SELECT TO authenticated
  USING (public.can_view_time_log(employee_id, work_order_id));
CREATE POLICY time_logs_insert_by_scope ON public.time_logs FOR INSERT TO authenticated
  WITH CHECK (public.can_write_time_log(employee_id, work_order_id));
CREATE POLICY time_logs_update_by_scope ON public.time_logs FOR UPDATE TO authenticated
  USING (public.can_write_time_log(employee_id, work_order_id))
  WITH CHECK (public.can_write_time_log(employee_id, work_order_id));

-- ---------------------------------------------------------------- R3
REVOKE ALL ON public.supplier_credentials FROM anon;
REVOKE SELECT ON public.supplier_credentials FROM authenticated;
GRANT SELECT (id, supplier_id, credential_type, api_endpoint, is_active, last_test_at, last_test_status,
              last_test_error, environment, notes, created_by, created_at, updated_at)
  ON public.supplier_credentials TO authenticated;

-- ---------------------------------------------------------------- R4
ALTER VIEW public.v_recent_audit_logs SET (security_invoker = true);

NOTIFY pgrst, 'reload schema';

COMMIT;
