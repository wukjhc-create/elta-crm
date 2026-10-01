-- =====================================================================
-- 00177 — P-009 laese-side A3: bekraeftelses-tokens skjult + kunde-underskrifter ikke laesbare via REST
--
-- Fund (prod read-only 2026-10-01, scripts/prod-sensitive-columns.ts):
--   * document_confirmations.token (3 raekker) kunne laeses af enhver indlogget -> en medarbejder kunne bekraefte et
--     dokument PAA KUNDENS VEGNE (forfalsket samtykke) via det offentlige bekraeftelses-flow.
--   * offer_signatures.signature_data (kundens underskrift, 3 raekker) kunne laeses af enhver indlogget. Appen laeser
--     KUN underskrifter i kundeportalen (service-role) — ingen bruger-session-laesninger (rls/read-sites.ts).
-- Kode (deployet FOER): createConfirmationRequests returnerer ikke token fra INSERT (hentes med service-role);
-- bekraeftelses-mailen bygger linket med service-role. Kundens indsendelse/validering bruger allerede service-role.
-- Rollback:
--   GRANT SELECT ON public.document_confirmations TO authenticated;
--   GRANT SELECT ON public.offer_signatures TO authenticated;
-- =====================================================================

BEGIN;

REVOKE SELECT ON public.document_confirmations FROM authenticated;
GRANT SELECT (id, customer_document_id, service_case_id, recipient_type, recipient_customer_id, recipient_contact_id,
  recipient_email, recipient_name, recipient_role, status, expires_at, mail_sent_at, mail_error, first_opened_at,
  last_opened_at, open_count, confirmed_at, confirmed_by_name, confirmed_by_email, confirmation_note, confirmed_ip,
  confirmed_user_agent, revoked_at, revoked_by, revoked_reason, created_at, created_by, metadata)
  ON public.document_confirmations TO authenticated;

REVOKE SELECT ON public.offer_signatures FROM authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
