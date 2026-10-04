-- 00187 — N69: "Markér som besvaret" på mailtråde (AFVENTER HENRIK — køres IKKE uden godkendelse)
--
-- Problem (prod read-only 2026-10-04): kun kontakt@ og ordre@ synkes; medarbejderne svarer fra personlige postkasser
-- (hc@, lj@ …), så CRM ser aldrig svaret. 117 tråde stod "kræver svar", 95 ældre end 30 dage (scripts/
-- prod-requires-response.ts). Cockpittet tæller nu kun 14 dage (N73), men trådene forsvinder aldrig af sig selv.
--
-- Model: en tråd (conversation_id) er besvaret, når den seneste indgående mail har responded_at sat. Ny indgående mail i
-- tråden har responded_at = NULL → tråden kræver svar igen (ingen ekstra logik nødvendig).
--   responded_at  timestamptz NULL — hvornår brugeren markerede tråden som besvaret
--   responded_by  uuid NULL → profiles(id) — hvem
-- Ingen nye RLS-politikker: skrives af server-action (inbox.view) via brugerens klient under de eksisterende
-- incoming_emails-politikker (samme vej som is_read/is_archived). GRANT ALL til authenticated findes (00049).
--
-- Rollback:
--   ALTER TABLE public.incoming_emails DROP COLUMN IF EXISTS responded_by, DROP COLUMN IF EXISTS responded_at;

BEGIN;

ALTER TABLE public.incoming_emails
  ADD COLUMN IF NOT EXISTS responded_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS responded_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.incoming_emails.responded_at IS
  'N69: tråden er markeret besvaret (fx svaret fra en personlig postkasse som CRM ikke synker). NULL = ikke markeret.';
COMMENT ON COLUMN public.incoming_emails.responded_by IS 'N69: hvem markerede tråden som besvaret.';

COMMIT;
