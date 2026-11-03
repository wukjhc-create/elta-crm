-- 00246 — incoming_emails SELECT efter effektive rettigheder (erstatter 00180 i prod / 00186 på staging)
--
-- Fund P-1 (docs/runbooks/schema-parity-2026-11-03.md): prod kører 00180 (bogholderi ser HELE postkassen), staging 00186.
-- Begge bruger rå user_role() → en per-medarbejder-grant/revoke virker ikke på mails i databasen. Henrik 2026-11-03:
-- ny forward-migration med nutidens model, ikke 00186 som den er.
--
-- En mail er synlig når mindst én af disse gælder (alle via user_has_permission = rolle + overrides, kun aktiv profil):
--   1. inbox.view                                    → hele postkassen (indbakke, lead/kunde/sag fra mail, dashboards)
--   2. kunde-mail: customer_id sat + customers.emails.view + kunden i scope (customers.view.all ELLER
--      my_customer_scope_ids())                       → kundekortets mails/tidslinje
--   3. ukoblet mail: customer_id NULL + customers.emails.view + customers.edit + customers.view.all
--                                                    → kundekortets adresse-match og efterkobling (retro-link), sag/tilbud
--                                                      fra mail. Kun brugere der kan rette ALLE kunder (ikke scope-brugere).
--   4. sags-mail: service_case_id sat + sagen i scope (cases.view.all ELLER my_case_scope_ids())
--                                                    → sagens/ordrens Mails-fane (getEmailsForCase/getCaseEmailDetail har
--                                                      samme gate i appen). Erstatter montør-klausulen (user_can_see_case).
--   5. faktura-kilde: incoming_invoices.view + en leverandørfaktura som brugeren må se har mailen som kilde
--                                                    → fakturakøen (afsender/domæne). Følger incoming_invoices' egen RLS.
--
-- Standardroller (ingen overrides):
--   admin, serviceleder → alt (1)                                         = uændret
--   salg                → kunde-mails (2, view.all) + ukoblede (3) + egne sager (4) = uændret (alle rækker som før)
--   bogholderi          → kunde-mails (2) + sags-mails (4, cases.view.all) + faktura-kilder (5); IKKE ukoblede mails
--                         (nye henvendelser, nyhedsbreve, leverandør-/intern post) — D28 (Henrik 2026-10-02)
--   montør              → kun mails på sager i eget OWN/RELATED-scope (4) = som 00180 (scope-motoren fra 00240)
--   inaktiv/manglende profil, anon → intet
--
-- Uændret: INSERT/UPDATE/DELETE-politikker (rå rolle — egen bølge; en UPDATE rammer kun rækker SELECT viser), grants,
-- service_role (cron/sync/agenter), data. Ingen ny rettighedsnøgle.
--
-- Rollback (prod = 00180-tilstanden):
--   DROP POLICY IF EXISTS incoming_emails_select ON public.incoming_emails;
--   CREATE POLICY incoming_emails_select ON public.incoming_emails FOR SELECT TO authenticated USING (
--     public.user_role() IN ('admin', 'serviceleder', 'salg', 'bogholderi')
--     OR (public.user_role() = 'montør' AND service_case_id IS NOT NULL AND public.user_can_see_case(service_case_id)));
--   NOTIFY pgrst, 'reload schema';
-- (staging-rollback = 00186-politikken, se 00186_incoming_emails_bogholderi_scope.sql)

BEGIN;

-- 0. Forudsætninger: 00238/00240-hjælpere og de nøgler politikken bruger
DO $guard$
BEGIN
  IF to_regprocedure('public.user_has_permission(text)') IS NULL
     OR to_regprocedure('public.my_customer_scope_ids()') IS NULL
     OR to_regprocedure('public.my_case_scope_ids()') IS NULL THEN
    RAISE EXCEPTION '00246: user_has_permission/my_customer_scope_ids/my_case_scope_ids mangler — 00238/00240 skal være anvendt';
  END IF;
  IF (SELECT count(*) FROM public.permission_catalog WHERE permission IN (
        'inbox.view', 'customers.emails.view', 'customers.view.all', 'customers.edit', 'cases.view.all', 'incoming_invoices.view')) <> 6 THEN
    RAISE EXCEPTION '00246: forudsatte rettighedsnøgler mangler i permission_catalog';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.incoming_emails'::regclass) THEN
    RAISE EXCEPTION '00246: RLS er ikke slået til på incoming_emails';
  END IF;
END
$guard$;

-- 1. Fjern ALLE eksisterende SELECT-politikker (00180/00186: incoming_emails_select); skrive-politikker røres ikke
DO $drop$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
            WHERE schemaname = 'public' AND tablename = 'incoming_emails' AND cmd = 'SELECT' LOOP
    EXECUTE format('DROP POLICY %I ON public.incoming_emails', p.policyname);
  END LOOP;
END
$drop$;

-- 2. Ny SELECT-politik (hjælperne i (SELECT …) → evalueres én gang pr. forespørgsel)
CREATE POLICY incoming_emails_select ON public.incoming_emails
  FOR SELECT TO authenticated
  USING (
    (SELECT public.user_has_permission('inbox.view'))
    OR (customer_id IS NOT NULL
        AND (SELECT public.user_has_permission('customers.emails.view'))
        AND ((SELECT public.user_has_permission('customers.view.all'))
             OR customer_id = ANY ((SELECT public.my_customer_scope_ids())::uuid[])))
    OR (customer_id IS NULL
        AND (SELECT public.user_has_permission('customers.emails.view'))
        AND (SELECT public.user_has_permission('customers.edit'))
        AND (SELECT public.user_has_permission('customers.view.all')))
    OR (service_case_id IS NOT NULL
        AND ((SELECT public.user_has_permission('cases.view.all'))
             OR service_case_id = ANY ((SELECT public.my_case_scope_ids())::uuid[])))
    OR ((SELECT public.user_has_permission('incoming_invoices.view'))
        AND EXISTS (SELECT 1 FROM public.incoming_invoices ii WHERE ii.source_email_id = incoming_emails.id))
  );

NOTIFY pgrst, 'reload schema';

COMMIT;
