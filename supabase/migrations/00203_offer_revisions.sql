-- 00203 — Tilbudsrevisioner (Henrik 2026-10-07: GODKENDT TIL STAGING ONLY; ingen prod endnu).
-- Design: docs/design/offer-revisions.md. Sendt version er uforanderlig (snapshot), ændring = ny revision,
-- underskrift bindes til den præcise revision, portalen viser den gældende revision.
--
-- Rollback: ALTER TABLE offer_signatures DROP COLUMN snapshot_id; DROP TABLE offer_snapshots;
--   ALTER TABLE offers DROP COLUMN revision_number, DROP COLUMN revision_of, DROP COLUMN superseded_by,
--   DROP COLUMN superseded_at;

BEGIN;

-- 1) Revision-kæde på tilbuddet
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS revision_number integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS revision_of uuid NULL REFERENCES public.offers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS superseded_by uuid NULL REFERENCES public.offers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS superseded_at timestamptz NULL;
CREATE INDEX IF NOT EXISTS idx_offers_revision_of ON public.offers(revision_of);

-- 2) Uforanderligt øjebliksbillede af det SENDTE indhold
CREATE TABLE IF NOT EXISTS public.offer_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES public.offers(id) ON DELETE CASCADE,
  revision_number integer NOT NULL,
  snapshot jsonb NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  sent_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  UNIQUE (offer_id, revision_number)
);
ALTER TABLE public.offer_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS offer_snapshots_select ON public.offer_snapshots;
CREATE POLICY offer_snapshots_select ON public.offer_snapshots FOR SELECT TO authenticated
  USING (public.user_role() IN ('admin', 'serviceleder', 'salg', 'bogholderi'));
-- Ingen INSERT/UPDATE/DELETE-politik for authenticated: snapshots skrives KUN server-side (service-role) → uforanderlige
REVOKE ALL ON public.offer_snapshots FROM anon;
REVOKE ALL ON public.offer_snapshots FROM authenticated;
GRANT SELECT ON public.offer_snapshots TO authenticated;
GRANT ALL ON public.offer_snapshots TO service_role;

-- 3) Underskriften bindes til den underskrevne revision
ALTER TABLE public.offer_signatures ADD COLUMN IF NOT EXISTS snapshot_id uuid NULL REFERENCES public.offer_snapshots(id) ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';

COMMIT;
