-- 00218: kundedokumenter er INTERNE som standard — vises kun i kundeportalen efter aktivt valg "Del med kunde".
-- Henrik 2026-10-10 (kunde-review #2): portalen viste ALLE kundedokumenter uden mail-kilde (fx et internt
-- leverandørtilbud eller en kalkulations-PDF uploadet på kundekortet blev straks synlig for kunden).
--
-- Ny kolonne visible_in_portal (default false). Eksisterende dokumenter BEHOLDER deres nuværende synlighed
-- (backfill = det portalen viser i dag: source_email_id IS NULL), så intet forsvinder for kunderne ved udrulning.
-- Nye manuelle uploads (kundekort/sag) er interne; besigtigelsesrapporter (sendes alligevel til kunden) og fuldmagter
-- oprettes delte af appen. Mail-arkiverede vedhæftninger (source_email_id) forbliver altid interne.
-- Tabel-niveau-grants (00052) dækker den nye kolonne. Dataændring: kun backfill af den nye kolonne.

BEGIN;

ALTER TABLE public.customer_documents
  ADD COLUMN IF NOT EXISTS visible_in_portal boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.customer_documents.visible_in_portal IS
  'Delt med kunden i portalen (aktivt valg "Del med kunde"). Default false = internt. Mail-arkiv (source_email_id) vises aldrig.';

UPDATE public.customer_documents
  SET visible_in_portal = true
  WHERE source_email_id IS NULL AND visible_in_portal = false;

CREATE INDEX IF NOT EXISTS idx_customer_documents_portal
  ON public.customer_documents (customer_id)
  WHERE visible_in_portal;

NOTIFY pgrst, 'reload schema';

COMMIT;
