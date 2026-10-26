-- =====================================================================
-- FORSLAG 00239 — PERM-1 fase 4, bølge 1: customers + service_cases SKRIVNING følger effektive rettigheder
--
-- STATUS: DRAFT — IKKE ANVENDT (hverken staging eller prod). Kræver særskilt godkendelse pr. miljø.
-- Forslag: docs/runbooks/mp-00239-customers-cases-permission-rls.md
-- Kræver: 00238 (user_has_permission(text), i prod 2026-10-26).
--
-- Kun INSERT/UPDATE/DELETE konverteres fra user_role() IN (...) til user_has_permission('…'). SELECT er UÆNDRET
-- (prod 2026-10-26: customers har to USING(true)-politikker + én created_by-politik; service_cases USING(true)).
-- Nul overrides → samme rollesæt som i dag for alle app-stier (nøgle-mapping nedenfor), MED ÉN BEVIDST UNDTAGELSE til
-- beslutning: montør fjernes fra INSERT på begge tabeller (rest fra før G9, 2026-10-01 — ingen app-sti indsætter som
-- montør; en montør med ekstra adgang customers.create/cases.create kan stadig — se U229 B/C).
-- `(SELECT public.user_has_permission(...))` evalueres én gang pr. sætning (initPlan).
-- =====================================================================

BEGIN;

-- Værn: alle anvendte nøgler skal findes i kataloget (en ukendt nøgle ville stille give false)
DO $$
DECLARE missing text;
BEGIN
  SELECT string_agg(k, ', ') INTO missing
  FROM unnest(ARRAY['customers.create', 'customers.edit', 'customers.delete', 'offers.create', 'inbox.view',
                    'cases.create', 'cases.edit', 'cases.close', 'cases.delete', 'service.close']) AS k
  WHERE NOT EXISTS (SELECT 1 FROM public.permission_catalog c WHERE c.permission = k);
  IF missing IS NOT NULL THEN RAISE EXCEPTION '00239: ukendte rettighedsnøgler: %', missing; END IF;
END $$;

-- ---------------------------------------------------------------------
-- customers
--   INSERT  customers.create OR offers.create OR inbox.view   (= {admin, serviceleder, salg} uden overrides)
--           offers.create: quickCreateCustomerAndOffer · inbox.view: opret kunde + sag fra mail
--   UPDATE  customers.edit                                     (= {admin, serviceleder, salg} — som i dag)
--   DELETE  customers.delete                                   (= {admin} — som i dag)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS customers_insert_role ON public.customers;
CREATE POLICY customers_insert_role ON public.customers FOR INSERT TO authenticated WITH CHECK (
  (SELECT public.user_has_permission('customers.create'))
  OR (SELECT public.user_has_permission('offers.create'))
  OR (SELECT public.user_has_permission('inbox.view'))
);
DROP POLICY IF EXISTS customers_update_role ON public.customers;
CREATE POLICY customers_update_role ON public.customers FOR UPDATE TO authenticated
  USING ((SELECT public.user_has_permission('customers.edit')))
  WITH CHECK ((SELECT public.user_has_permission('customers.edit')));
DROP POLICY IF EXISTS customers_delete_role ON public.customers;
CREATE POLICY customers_delete_role ON public.customers FOR DELETE TO authenticated
  USING ((SELECT public.user_has_permission('customers.delete')));

-- ---------------------------------------------------------------------
-- service_cases
--   INSERT  cases.create OR inbox.view                          (= {admin, serviceleder, salg})
--   UPDATE  cases.edit OR cases.close OR service.close OR cases.create (= {admin, serviceleder, salg} — PRÆCIS som i dag)
--           (valgfri stramning, beslutning B i forslaget: salg kun på forslag — `cases.create AND is_proposal = true`)
--   DELETE  cases.delete OR (cases.create AND is_proposal = true) (= admin · serviceleder/salg kun forslag — som i dag)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS service_cases_insert_role ON public.service_cases;
CREATE POLICY service_cases_insert_role ON public.service_cases FOR INSERT TO authenticated WITH CHECK (
  (SELECT public.user_has_permission('cases.create'))
  OR (SELECT public.user_has_permission('inbox.view'))
);
DROP POLICY IF EXISTS service_cases_update_role ON public.service_cases;
CREATE POLICY service_cases_update_role ON public.service_cases FOR UPDATE TO authenticated
  USING (
    (SELECT public.user_has_permission('cases.edit'))
    OR (SELECT public.user_has_permission('cases.close'))
    OR (SELECT public.user_has_permission('service.close'))
    OR (SELECT public.user_has_permission('cases.create'))
  )
  WITH CHECK (
    (SELECT public.user_has_permission('cases.edit'))
    OR (SELECT public.user_has_permission('cases.close'))
    OR (SELECT public.user_has_permission('service.close'))
    OR (SELECT public.user_has_permission('cases.create'))
  );
DROP POLICY IF EXISTS service_cases_delete_role ON public.service_cases;
CREATE POLICY service_cases_delete_role ON public.service_cases FOR DELETE TO authenticated USING (
  (SELECT public.user_has_permission('cases.delete'))
  OR ((SELECT public.user_has_permission('cases.create')) AND is_proposal = true)
);

NOTIFY pgrst, 'reload schema';

COMMIT;

-- =====================================================================
-- ROLLBACK (gendanner præcis prod-definitionerne fra 2026-10-26)
-- =====================================================================
-- BEGIN;
-- DROP POLICY IF EXISTS customers_insert_role ON public.customers;
-- CREATE POLICY customers_insert_role ON public.customers FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'salg', 'montør'));
-- DROP POLICY IF EXISTS customers_update_role ON public.customers;
-- CREATE POLICY customers_update_role ON public.customers FOR UPDATE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder', 'salg')) WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'salg'));
-- DROP POLICY IF EXISTS customers_delete_role ON public.customers;
-- CREATE POLICY customers_delete_role ON public.customers FOR DELETE TO authenticated USING (public.user_role() IN ('admin'));
-- DROP POLICY IF EXISTS service_cases_insert_role ON public.service_cases;
-- CREATE POLICY service_cases_insert_role ON public.service_cases FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'salg', 'montør'));
-- DROP POLICY IF EXISTS service_cases_update_role ON public.service_cases;
-- CREATE POLICY service_cases_update_role ON public.service_cases FOR UPDATE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder', 'salg')) WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'salg'));
-- DROP POLICY IF EXISTS service_cases_delete_role ON public.service_cases;
-- CREATE POLICY service_cases_delete_role ON public.service_cases FOR DELETE TO authenticated USING ((public.user_role() IN ('admin')) OR (public.user_role() IN ('serviceleder', 'salg') AND is_proposal = true));
-- NOTIFY pgrst, 'reload schema';
-- COMMIT;
