-- =====================================================================================================================
-- 00241 — LÆSE-SCOPE for kunde-nøglede børnetabeller
--
-- GODKENDT TIL STAGING 2026-10-28 (Henrik). PROD KRÆVER SÆRSKILT GODKENDELSE.
-- Testet udkast: docs/runbooks/mp-00241-draft.sql (kroppen fra BEGIN; er byte-identisk med det testede udkast)
-- Kræver 00240 (my_customer_scope_ids()/my_case_scope_ids()). Design + beslutninger O3/O4/O6: docs/runbooks/mp-00241-00242-child-scope-design.md
--
-- Regler (Henrik 2026-10-27):
--   customer_contacts / customer_notes → forælder-kundens effektive scope (customers.view.all ELLER kunden i mit scope)
--   customer_documents  → på sag: sags-scope · uden sag: customers.view + kunde i scope + CU-1 (cases.view.all |
--                         customers.edit | kunden har en sag i mit scope) · mail-vedhæftning kræver customers.emails.view
--                         (= lib/documents/document-read-access.ts + getCustomerDocuments)
--   roof_drawings       → på sag: sags-scope · uden sag: kunde-scope (= roof-drawings.ts F4)
--   document_confirmations → på sag: sags-scope · uden sag: dokumentet skal være synligt (fail-closed, O4)
-- customer_notes findes kun på staging (00196) — håndteres betinget. Skrive-politikker er uændrede.
-- =====================================================================================================================
BEGIN;

-- 0. Forudsætninger: 00240-hjælperne + PRÆCIS de kendte åbne SELECT-politikker (ellers afbrydes alt)
DO $guard$
BEGIN
  IF to_regprocedure('public.my_customer_scope_ids()') IS NULL OR to_regprocedure('public.my_case_scope_ids()') IS NULL THEN
    RAISE EXCEPTION '00241: 00240-hjælperne mangler — anvend 00240 først';
  END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND cmd IN ('SELECT', 'ALL') AND 'authenticated' = ANY (roles)
      AND tablename IN ('customer_contacts', 'customer_documents', 'roof_drawings', 'document_confirmations', 'customer_notes')) <>
     (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND cmd = 'SELECT' AND qual = 'true' AND policyname IN (
       'customer_contacts_select_authenticated', 'customer_documents_select_authenticated', 'roof_drawings_select_authenticated',
       'document_confirmations_select_authenticated', 'customer_notes_select')) THEN
    RAISE EXCEPTION '00241: uventede SELECT/ALL-politikker for authenticated på børnetabellerne — kontrollér før kørsel';
  END IF;
END
$guard$;

-- 1. Hjælper: kunder (customer_id) på sager i mit sags-scope — CU-1 for sagsløse dokumenter (kun service_cases.customer_id,
--    ikke de 6 parts-FK'er; = getCustomerDocuments/documentReadDenied). Mængde-baseret, InitPlan via (SELECT …).
CREATE OR REPLACE FUNCTION public.my_case_customer_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(array_agg(DISTINCT s.customer_id) FILTER (WHERE s.customer_id IS NOT NULL), '{}'::uuid[])
    FROM public.service_cases s
   WHERE s.id = ANY ((SELECT public.my_case_scope_ids())::uuid[])
$$;
REVOKE ALL ON FUNCTION public.my_case_customer_ids() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.my_case_customer_ids() TO authenticated;

-- 2. customer_contacts (mail-modtagere, opkald/CTI, vælgere) — ingen skjult global kontaktliste
DROP POLICY IF EXISTS customer_contacts_select_authenticated ON public.customer_contacts;
CREATE POLICY customer_contacts_select_scope ON public.customer_contacts
  FOR SELECT TO authenticated
  USING (
    (SELECT public.user_has_permission('customers.view.all'))
    OR customer_id = ANY ((SELECT public.my_customer_scope_ids())::uuid[])
  );

-- 3. customer_notes (kun hvis tabellen findes — 00196 er kun anvendt på staging)
DO $notes$
BEGIN
  IF to_regclass('public.customer_notes') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS customer_notes_select ON public.customer_notes';
    EXECUTE $p$CREATE POLICY customer_notes_select_scope ON public.customer_notes
      FOR SELECT TO authenticated
      USING ((SELECT public.user_has_permission('customers.view.all'))
             OR customer_id = ANY ((SELECT public.my_customer_scope_ids())::uuid[]))$p$;
  END IF;
END
$notes$;

-- 4. customer_documents
DROP POLICY IF EXISTS customer_documents_select_authenticated ON public.customer_documents;
CREATE POLICY customer_documents_select_scope ON public.customer_documents
  FOR SELECT TO authenticated
  USING (
    (source_email_id IS NULL OR (SELECT public.user_has_permission('customers.emails.view')))
    AND (
      (service_case_id IS NOT NULL AND (
        (SELECT public.user_has_permission('cases.view.all'))
        OR service_case_id = ANY ((SELECT public.my_case_scope_ids())::uuid[])))
      OR
      (service_case_id IS NULL
        AND (SELECT public.user_has_permission('customers.view'))
        AND ((SELECT public.user_has_permission('customers.view.all'))
             OR customer_id = ANY ((SELECT public.my_customer_scope_ids())::uuid[]))
        AND ((SELECT public.user_has_permission('cases.view.all'))
             OR (SELECT public.user_has_permission('customers.edit'))
             OR customer_id = ANY ((SELECT public.my_case_customer_ids())::uuid[])))
    )
  );

-- 5. roof_drawings
DROP POLICY IF EXISTS roof_drawings_select_authenticated ON public.roof_drawings;
CREATE POLICY roof_drawings_select_scope ON public.roof_drawings
  FOR SELECT TO authenticated
  USING (
    (service_case_id IS NOT NULL AND (
      (SELECT public.user_has_permission('cases.view.all'))
      OR service_case_id = ANY ((SELECT public.my_case_scope_ids())::uuid[])))
    OR
    (service_case_id IS NULL AND (
      (SELECT public.user_has_permission('customers.view.all'))
      OR customer_id = ANY ((SELECT public.my_customer_scope_ids())::uuid[])))
  );

-- 6. document_confirmations (token-kolonnen er allerede REVOKE'd, 00177; portal/token-flow kører som service-role)
--    Sagsløse: EXISTS kører som invoker → dokumentets politik ovenfor afgør (fail-closed for begrænsede roller, O4).
DROP POLICY IF EXISTS document_confirmations_select_authenticated ON public.document_confirmations;
CREATE POLICY document_confirmations_select_scope ON public.document_confirmations
  FOR SELECT TO authenticated
  USING (
    ((SELECT public.user_has_permission('cases.view.all')) AND (SELECT public.user_has_permission('customers.view.all')))
    OR (service_case_id IS NOT NULL AND service_case_id = ANY ((SELECT public.my_case_scope_ids())::uuid[]))
    OR (service_case_id IS NULL AND EXISTS (
      SELECT 1 FROM public.customer_documents d WHERE d.id = document_confirmations.customer_document_id))
  );

NOTIFY pgrst, 'reload schema';
COMMIT;

-- =====================================================================================================================
-- ROLLBACK (én transaktion; genskaber de brede authenticated-SELECT-politikker. Rører IKKE anon.)
-- ---------------------------------------------------------------------------------------------------------------------
-- BEGIN;
-- DROP POLICY IF EXISTS customer_contacts_select_scope ON public.customer_contacts;
-- CREATE POLICY customer_contacts_select_authenticated ON public.customer_contacts FOR SELECT TO authenticated USING (true);
-- DO $r$ BEGIN IF to_regclass('public.customer_notes') IS NOT NULL THEN
--   EXECUTE 'DROP POLICY IF EXISTS customer_notes_select_scope ON public.customer_notes';
--   EXECUTE 'CREATE POLICY customer_notes_select ON public.customer_notes FOR SELECT TO authenticated USING (true)';
-- END IF; END $r$;
-- DROP POLICY IF EXISTS customer_documents_select_scope ON public.customer_documents;
-- CREATE POLICY customer_documents_select_authenticated ON public.customer_documents FOR SELECT TO authenticated USING (true);
-- DROP POLICY IF EXISTS roof_drawings_select_scope ON public.roof_drawings;
-- CREATE POLICY roof_drawings_select_authenticated ON public.roof_drawings FOR SELECT TO authenticated USING (true);
-- DROP POLICY IF EXISTS document_confirmations_select_scope ON public.document_confirmations;
-- CREATE POLICY document_confirmations_select_authenticated ON public.document_confirmations FOR SELECT TO authenticated USING (true);
-- DROP FUNCTION IF EXISTS public.my_case_customer_ids();
-- NOTIFY pgrst, 'reload schema';
-- COMMIT;
-- =====================================================================================================================
