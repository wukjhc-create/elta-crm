-- =====================================================
-- Migration 00233: fælles opfølgning på leads (follow_up_at / follow_up_owner / follow_up_note)
--
-- STATUS: FORSLAG — kræver Henriks EKSPLICITTE godkendelse. Ikke kørt (hverken staging eller prod).
--
-- Baggrund (Henrik 2026-10-16): "Byg et rigtigt fælles lead follow-up felt/workflow. Brug IKKE personal_reminders.
-- Lead follow-up skal være shared operational sales data: follow_up_at, evt. follow_up_owner, status/overdue, synlig i
-- lead-liste/kanban, kalender/opgave-integration."
--
-- Ændring (kun nye, valgfrie kolonner — eksisterende rækker uændrede, ingen backfill/gæt):
--   leads.follow_up_at     timestamptz NULL  — hvornår der skal følges op (Københavnstid i UI)
--   leads.follow_up_owner  uuid NULL → profiles(id) ON DELETE SET NULL — hvem (default i UI: assigned_to)
--   leads.follow_up_note   text NULL (≤ 500 tegn) — hvad opfølgningen går ud på
-- "Forfalden" afledes (follow_up_at < nu og lead ikke vundet/tabt) — intet statusfelt at holde i sync.
-- RLS: kolonner på eksisterende tabel → eksisterende leads-politikker gælder (samme synlighed som leadet).
-- Backward-compatible: koden læser kolonnerne valgfrit (feature-flag LEAD_FOLLOW_UP_ENABLED) og kan pushes FØR
--   migrationen (Henriks procesregel 2026-10-16: CODE → TEST → PUSH → MIGRATION → POST-CHECK).
-- Pre/post: kolonner findes ikke / findes; antal leads + checksum (id, status, assigned_to) identisk.
-- Rollback:
--   DROP INDEX IF EXISTS public.idx_leads_follow_up_open;
--   ALTER TABLE public.leads DROP COLUMN IF EXISTS follow_up_note, DROP COLUMN IF EXISTS follow_up_owner,
--     DROP COLUMN IF EXISTS follow_up_at;
-- =====================================================

BEGIN;

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS follow_up_at timestamptz;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS follow_up_owner uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS follow_up_note text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_follow_up_note_len') THEN
    ALTER TABLE public.leads ADD CONSTRAINT leads_follow_up_note_len CHECK (follow_up_note IS NULL OR char_length(follow_up_note) <= 500);
  END IF;
END $$;

-- Opfølgningslister ("forfaldne", "i dag", tavlen) — kun åbne leads med opfølgning
CREATE INDEX IF NOT EXISTS idx_leads_follow_up_open ON public.leads (follow_up_at)
  WHERE follow_up_at IS NOT NULL AND status NOT IN ('won', 'lost');

NOTIFY pgrst, 'reload schema';

COMMIT;
