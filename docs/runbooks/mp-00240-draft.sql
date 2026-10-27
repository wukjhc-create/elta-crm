-- =====================================================================================================================
-- 00240 — LÆSE-SCOPE for customers + service_cases (UDKAST — IKKE en migration, ligger bevidst uden for
-- supabase/migrations og må ikke anvendes uden Henriks særskilte godkendelse pr. miljø).
-- Design + beslutninger D1–D6: docs/runbooks/mp-00240-read-scope-proposal.md · app-model: src/lib/auth/scope-model.ts
--
-- Effekt (uden overrides):
--   admin/serviceleder/bogholderi/salg  → kunder ALL (customers.view.all)        sager: ALL undtagen salg (OWN/RELATED)
--   montør/Elektriker                    → kunder OWN+RELATED                      sager: OWN+RELATED
--   Overmontør (skabelon)                → kunder ALL + sager ALL
--   inaktiv / manglende profil / anon    → intet
-- Skrive-politikkerne fra 00239 er uændrede. Børnetabeller (kontakter, dokumenter, noter, arbejdsordrer,
-- tagtegninger, opgaver …) er IKKE med — 00241/00242.
-- =====================================================================================================================
BEGIN;

-- 0. Forudsætninger: nøgler, hjælpere og PRÆCIS de fire kendte SELECT-politikker (ellers afbrydes alt)
DO $guard$
BEGIN
  IF (SELECT count(*) FROM public.permission_catalog
      WHERE permission IN ('customers.view', 'cases.view.all', 'cases.view.assigned')) <> 3 THEN
    RAISE EXCEPTION '00240: forudsatte rettighedsnøgler mangler i permission_catalog';
  END IF;
  IF to_regprocedure('public.user_has_permission(text)') IS NULL OR to_regprocedure('public.current_employee_id()') IS NULL THEN
    RAISE EXCEPTION '00240: user_has_permission/current_employee_id mangler';
  END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('customers', 'service_cases') AND cmd = 'SELECT')
     <> 4 THEN
    RAISE EXCEPTION '00240: uventede SELECT-politikker på customers/service_cases — kontrollér før kørsel';
  END IF;
END
$guard$;

-- 1. Ny nøgle customers.view.all (D2) — katalog + rollestandarder (= src/lib/auth/permissions.ts)
INSERT INTO public.permission_catalog (permission) VALUES ('customers.view.all') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permission_defaults (role, permission) VALUES
  ('admin', 'customers.view.all'),
  ('bogholderi', 'customers.view.all'),
  ('salg', 'customers.view.all'),
  ('serviceleder', 'customers.view.all')
ON CONFLICT DO NOTHING;

-- 2. Hjælpere — mængde-baserede (beregnes ÉN gang pr. forespørgsel som InitPlan via (SELECT …) i politikken, ikke pr. række).
--    SECURITY DEFINER: ejer = postgres (BYPASSRLS, ingen FORCE RLS på tabellerne) → ingen RLS-rekursion når politikken på
--    service_cases/customers kalder en funktion der læser de samme tabeller. Returnerer kun id'er brugeren må se.
CREATE OR REPLACE FUNCTION public.my_case_scope_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  -- OWN ∪ RELATED (scope-model.ts): oprettet af/tildelt mig · ikke-annulleret arbejdsordre tildelt min AKTIVE
  -- employees-række · D4: sagen er konverteret fra et tilbud jeg har oprettet. Kræver cases.view.assigned.
  SELECT CASE WHEN NOT public.user_has_permission('cases.view.assigned') THEN '{}'::uuid[]
  ELSE coalesce((
    SELECT array_agg(DISTINCT x.id) FROM (
      SELECT s.id FROM public.service_cases s WHERE s.created_by = auth.uid()
      UNION
      SELECT s.id FROM public.service_cases s WHERE s.assigned_to = auth.uid()
      UNION
      SELECT w.case_id FROM public.work_orders w
       WHERE w.assigned_employee_id = public.current_employee_id()
         AND w.status <> 'cancelled' AND w.case_id IS NOT NULL
      UNION
      SELECT s.id FROM public.service_cases s JOIN public.offers o ON o.id = s.source_offer_id
       WHERE o.created_by = auth.uid()
    ) x), '{}'::uuid[]) END
$$;

CREATE OR REPLACE FUNCTION public.my_customer_scope_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  -- OWN ∪ RELATED (scope-model.ts): oprettet af mig · part (6 FK'er) på en sag i mit sags-scope · kunde på en
  -- ikke-annulleret arbejdsordre tildelt mig · kunde på en ÅBEN opgave (pending|in_progress) tildelt mig (D3).
  -- Kræver customers.view.
  SELECT CASE WHEN NOT public.user_has_permission('customers.view') THEN '{}'::uuid[]
  ELSE coalesce((
    SELECT array_agg(DISTINCT x.cid) FROM (
      SELECT c.id AS cid FROM public.customers c WHERE c.created_by = auth.uid()
      UNION
      SELECT unnest(ARRAY[s.customer_id, s.site_customer_id, s.payer_customer_id, s.orderer_customer_id,
                          s.end_customer_id, s.purchased_from_customer_id])
        FROM public.service_cases s
       WHERE (SELECT public.user_has_permission('cases.view.all'))
          OR s.id = ANY ((SELECT public.my_case_scope_ids())::uuid[])
      UNION
      SELECT w.customer_id FROM public.work_orders w
       WHERE w.assigned_employee_id = public.current_employee_id() AND w.status <> 'cancelled'
      UNION
      SELECT t.customer_id FROM public.customer_tasks t
       WHERE t.assigned_to = auth.uid() AND t.status IN ('pending', 'in_progress')
    ) x WHERE x.cid IS NOT NULL), '{}'::uuid[]) END
$$;

REVOKE ALL ON FUNCTION public.my_case_scope_ids() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.my_customer_scope_ids() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.my_case_scope_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_customer_scope_ids() TO authenticated;

-- 3. SELECT-politikker. Rækkefølgen i OR er bevidst: ALL-tjekket er en InitPlan (én gang); OWN-grenen er inline (så
--    INSERT … RETURNING af en netop oprettet egen række virker); RELATED-mængden beregnes kun når de første grene fejler.
DROP POLICY IF EXISTS "Users can read their own customers" ON public.customers;
DROP POLICY IF EXISTS "Users can see their own customers" ON public.customers;
DROP POLICY IF EXISTS "Users can view customers" ON public.customers;
CREATE POLICY customers_select_scope ON public.customers
  FOR SELECT TO authenticated
  USING (
    (SELECT public.user_has_permission('customers.view.all'))
    OR ((SELECT public.user_has_permission('customers.view')) AND created_by = (SELECT auth.uid()))
    OR id = ANY ((SELECT public.my_customer_scope_ids())::uuid[])
  );

DROP POLICY IF EXISTS "Authenticated users can view service cases" ON public.service_cases;
CREATE POLICY service_cases_select_scope ON public.service_cases
  FOR SELECT TO authenticated
  USING (
    (SELECT public.user_has_permission('cases.view.all'))
    OR ((SELECT public.user_has_permission('cases.view.assigned'))
        AND (created_by = (SELECT auth.uid()) OR assigned_to = (SELECT auth.uid())))
    OR id = ANY ((SELECT public.my_case_scope_ids())::uuid[])
  );

-- 4. Indeks til hjælperne (små tabeller i dag: ~2k kunder / ~1,3k sager på staging, 117/8 i prod — almindelig
--    CREATE INDEX i transaktionen er acceptabelt; låser kun skrivning et øjeblik)
CREATE INDEX IF NOT EXISTS idx_service_cases_created_by ON public.service_cases (created_by);
CREATE INDEX IF NOT EXISTS idx_customers_created_by ON public.customers (created_by);
CREATE INDEX IF NOT EXISTS idx_work_orders_customer_id ON public.work_orders (customer_id);

NOTIFY pgrst, 'reload schema';
COMMIT;

-- =====================================================================================================================
-- ROLLBACK (kør som én transaktion; genskaber den BREDE authenticated-læsning — inkl. inaktive profiler — som før 00240.
-- Rører IKKE anon: der genåbnes ingen anonym adgang. Indeksene må gerne blive stående.)
-- ---------------------------------------------------------------------------------------------------------------------
-- BEGIN;
-- DROP POLICY IF EXISTS customers_select_scope ON public.customers;
-- DROP POLICY IF EXISTS service_cases_select_scope ON public.service_cases;
-- CREATE POLICY "Users can read their own customers" ON public.customers FOR SELECT TO authenticated USING (created_by = auth.uid());
-- CREATE POLICY "Users can see their own customers" ON public.customers FOR SELECT TO authenticated USING (true);
-- CREATE POLICY "Users can view customers" ON public.customers FOR SELECT TO authenticated USING (true);
-- CREATE POLICY "Authenticated users can view service cases" ON public.service_cases FOR SELECT TO authenticated USING (true);
-- DROP FUNCTION IF EXISTS public.my_customer_scope_ids();
-- DROP FUNCTION IF EXISTS public.my_case_scope_ids();
-- DELETE FROM public.user_permission_overrides WHERE permission = 'customers.view.all';
-- DELETE FROM public.role_permission_defaults WHERE permission = 'customers.view.all';
-- DELETE FROM public.permission_catalog WHERE permission = 'customers.view.all';
-- NOTIFY pgrst, 'reload schema';
-- COMMIT;
-- NB: appens kode (customers.view.all i permissions.ts) virker uændret efter rollback — nøglen styrer da kun app-laget.
-- =====================================================================================================================
