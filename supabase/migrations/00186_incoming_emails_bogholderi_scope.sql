-- 00186 — D28: bogholderi læser kun kunde-/faktura-relevante mails (least-privilege), ikke hele postkassen
--
-- Beslutning (Henrik 2026-10-02): "Bogholderi skal kunne se kundemails, der er relevante for kunde/faktura/økonomi,
-- men ikke automatisk hele virksomhedens mailbox."
--
-- Før (00180): incoming_emails SELECT for admin/serviceleder/salg/bogholderi = ALLE mails; montør kun egne sager.
-- Nu for bogholderi: kun mails der er
--   (a) koblet til en kunde (customer_id) — kundekortets mail-tidslinje (app: customers.emails.view, kun koblede), eller
--   (b) kilde til en leverandørfaktura (incoming_invoices.source_email_id) — fakturakøen.
-- Ukoblede mails (nye henvendelser, leverandør-/intern post, nyhedsbreve) er ikke synlige for bogholderi.
-- Uændret: admin/serviceleder/salg (ser alt som før), montør (00180), skrive-policies, anon, service-role (cron).
-- Ingen kodeændring kræves (appen filtrerer allerede bogholderi til koblede mails).
--
-- Afhænger af 00180 (user_can_see_case + montør-klausulen) — køres efter 00180.
--
-- Rollback: genskab policyen fra 00180:
--   DROP POLICY IF EXISTS incoming_emails_select ON public.incoming_emails;
--   CREATE POLICY incoming_emails_select ON public.incoming_emails FOR SELECT TO authenticated USING (
--     public.user_role() IN ('admin', 'serviceleder', 'salg', 'bogholderi')
--     OR (public.user_role() = 'montør' AND service_case_id IS NOT NULL AND public.user_can_see_case(service_case_id)));

BEGIN;

DROP POLICY IF EXISTS incoming_emails_select ON public.incoming_emails;
CREATE POLICY incoming_emails_select ON public.incoming_emails FOR SELECT TO authenticated USING (
  public.user_role() IN ('admin', 'serviceleder', 'salg')
  OR (public.user_role() = 'bogholderi' AND (
        customer_id IS NOT NULL
        OR EXISTS (SELECT 1 FROM public.incoming_invoices ii WHERE ii.source_email_id = incoming_emails.id)))
  OR (public.user_role() = 'montør' AND service_case_id IS NOT NULL AND public.user_can_see_case(service_case_id))
);

NOTIFY pgrst, 'reload schema';

COMMIT;
