-- 00180 — GO-LIVE G10: læse-lockdown af virksomhedens mail for montør + serviceleder kan se medarbejdere (planlægning)
--
-- Beslutning (Henrik 2026-10-01, G9): montører må IKKE se/arkivere virksomhedens postkasse, men SKAL kunne se mails der
-- er knyttet til deres egne sager/job. App-laget er lukket (inbox.view fjernet, sagsmails scope-tjekket — commit e42781d),
-- men incoming_emails havde SELECT USING (true) -> en montør kunne stadig læse al mail direkte via REST med sit login.
--
-- G5: serviceleder (employees.view, planlægger) kunne kun se sin egen employees-række (00096: admin-or-self) -> tom
-- medarbejderliste/kalender, kunne ikke tildele montører. Faktisk løn ligger i employee_compensation (admin/self, uændret);
-- employees.cost_rate/hourly_rate er intern kost-/salgssats, som serviceleder i forvejen ser via sagsøkonomi
-- (economy.cost_prices). Appen viser stadig kun satser med employees.payroll.view (admin).
--
-- Uændret: admin/serviceleder/salg/bogholderi læser mail som før (kundepostkasse, dashboards, sag fra mail);
-- skrive-policies; anon (har ingen SELECT-policy -> ser intet, som før; P-003-crons uændrede).
-- Ukendte roller (ingen CHECK på profiles.role) ser ingen mail (allowlist).
--
-- Rollback:
--   DROP POLICY incoming_emails_select ON public.incoming_emails;
--   CREATE POLICY incoming_emails_select ON public.incoming_emails FOR SELECT TO authenticated USING (true);
--   DROP POLICY employees_select_admin_or_self ON public.employees;
--   CREATE POLICY employees_select_admin_or_self ON public.employees FOR SELECT TO authenticated
--     USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin') OR profile_id = auth.uid());
--   DROP FUNCTION public.user_can_see_case(uuid);
-- =====================================================================

BEGIN;

-- Samme scope som appens getCaseScope (src/lib/auth/case-scope.ts): egne sager (assigned_to/created_by) + sager med en
-- arbejdsordre tildelt brugerens aktive medarbejder. SECURITY DEFINER: læser service_cases/work_orders/employees uden at
-- afhænge af (og rekursere i) deres egne policies. Ingen input ud over sags-id; afslører kun en boolean for kalderen selv.
CREATE OR REPLACE FUNCTION public.user_can_see_case(p_case_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
           SELECT 1 FROM public.service_cases sc
           WHERE sc.id = p_case_id AND (sc.assigned_to = auth.uid() OR sc.created_by = auth.uid())
         )
      OR EXISTS (
           SELECT 1 FROM public.work_orders w
           JOIN public.employees e ON e.id = w.assigned_employee_id
           WHERE w.case_id = p_case_id AND e.profile_id = auth.uid() AND e.active
         );
$$;
REVOKE ALL ON FUNCTION public.user_can_see_case(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_can_see_case(uuid) TO authenticated;

-- Mail: mail-/kontor-roller som før; montør kun mails på egne sager/job.
DROP POLICY IF EXISTS incoming_emails_select ON public.incoming_emails;
CREATE POLICY incoming_emails_select ON public.incoming_emails FOR SELECT TO authenticated USING (
  public.user_role() IN ('admin', 'serviceleder', 'salg', 'bogholderi')
  OR (public.user_role() = 'montør' AND service_case_id IS NOT NULL AND public.user_can_see_case(service_case_id))
);

-- Medarbejdere: planlæggere (employees.view = admin, serviceleder) ser alle; øvrige kun egen række (som før).
DROP POLICY IF EXISTS employees_select_admin_or_self ON public.employees;
CREATE POLICY employees_select_admin_or_self ON public.employees FOR SELECT TO authenticated USING (
  public.user_role() IN ('admin', 'serviceleder') OR profile_id = auth.uid()
);

NOTIFY pgrst, 'reload schema';

COMMIT;
