-- =====================================================
-- 00123: is_proposal flag paa service_cases + offers (Staging-model B)
--
-- Tilfoejer is_proposal BOOLEAN NOT NULL DEFAULT false paa begge tabeller.
-- Default false → eksisterende rows markeres IKKE som forslag.
--
-- Auto-flow (auto-case.ts, auto-offer.ts) saetter is_proposal=true ved
-- INSERT. Hovedlister (getServiceCases, getOffers) filtrerer
-- is_proposal=false som default. "Forslag fra mails"-siden filtrerer
-- omvendt.
--
-- Promote-handlingen sætter is_proposal=false (record flyttes til
-- hovedliste). Reject-handlingen er DELETE.
--
-- INGEN RLS-policy-aendring. INGEN data-migration paa eksisterende rows.
-- Idempotent via IF NOT EXISTS.
-- =====================================================

BEGIN;

ALTER TABLE service_cases
  ADD COLUMN IF NOT EXISTS is_proposal BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE offers
  ADD COLUMN IF NOT EXISTS is_proposal BOOLEAN NOT NULL DEFAULT false;

-- Partial indexes: proposals er et lille sub-set; hyppigt filter.
CREATE INDEX IF NOT EXISTS idx_service_cases_proposals
  ON service_cases(created_at DESC)
  WHERE is_proposal = true;

CREATE INDEX IF NOT EXISTS idx_offers_proposals
  ON offers(created_at DESC)
  WHERE is_proposal = true;

COMMENT ON COLUMN service_cases.is_proposal IS
  'Staging-model B (00123): true = AI/auto-genereret forslag, endnu ikke en aktiv sag. Hovedlister filtrerer disse ud per default; "Forslag fra mails" viser dem.';

COMMENT ON COLUMN offers.is_proposal IS
  'Staging-model B (00123): true = AI/auto-genereret tilbudsforslag, endnu ikke et reelt tilbud. Hovedlister filtrerer disse ud per default; "Forslag fra mails" viser dem.';

NOTIFY pgrst, 'reload schema';

COMMIT;
