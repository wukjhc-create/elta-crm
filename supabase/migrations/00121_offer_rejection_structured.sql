-- =====================================================
-- 00121: offers — strukturerede afvisnings-felter
--
-- Phase 12A — kunden kan vaelge kategorisk aarsag + bemaerkning ved
-- afvisning i begge public flows (/view-offer/[id] og portal).
--
-- ARKITEKTUR-NOTER:
--
--  1. Felter er ALLE NULLABLE saa eksisterende rejected offers (uden
--     kategorisk reason) forbliver gyldige. Ingen backfill — gamle rows
--     er historiske og vises som "Ikke angivet" i CRM.
--
--  2. rejection_reason har CHECK med 5 dropdown-vaerdier. NULL tillades
--     eksplicit i CHECK saa pre-00121 rejects ikke breaker. Nye codes
--     kan tilfoejes via idempotent DROP+ADD CHECK i fremtidig migration
--     (samme pattern som 00117 udvidede customer_documents.document_type).
--
--  3. Audit-felter (by_name/email/ip/user_agent) matcher offer_signatures-
--     patternet for accept-flowet — samme behandlings-hjemmel og UX.
--
--  4. INGEN aendring af offer_status enum, RLS, offer_signatures, eller
--     anden tabel. Kun nye kolonner + 1 CHECK + 1 partial index paa offers.
--
-- IDEMPOTENT:
--   - ADD COLUMN IF NOT EXISTS for alle 6 felter
--   - CHECK via pg_constraint-tjek + DO-block
--   - CREATE INDEX IF NOT EXISTS
--   - INGEN UPDATE, INGEN DELETE, INGEN aendring af eksisterende data
-- =====================================================

BEGIN;

-- =====================================================
-- 1. Kategorisk aarsag (NULL tilladt for historiske rejects)
-- =====================================================
ALTER TABLE offers
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'offers_rejection_reason_check'
      AND conrelid = 'offers'::regclass
  ) THEN
    ALTER TABLE offers
      ADD CONSTRAINT offers_rejection_reason_check
      CHECK (
        rejection_reason IS NULL OR rejection_reason IN (
          'price_too_high',
          'chose_competitor',
          'paused',
          'doesnt_match',
          'other'
        )
      );
  END IF;
END $$;

-- =====================================================
-- 2. Fri-tekst bemaerkning (separat fra offers.notes som er intern-noter)
-- =====================================================
ALTER TABLE offers
  ADD COLUMN IF NOT EXISTS rejection_note TEXT;

-- =====================================================
-- 3. Audit-felter (matcher offer_signatures-pattern for accept-flowet)
-- =====================================================
ALTER TABLE offers
  ADD COLUMN IF NOT EXISTS rejected_by_name TEXT,
  ADD COLUMN IF NOT EXISTS rejected_by_email TEXT,
  ADD COLUMN IF NOT EXISTS rejected_by_ip TEXT,
  ADD COLUMN IF NOT EXISTS rejected_by_user_agent TEXT;

-- =====================================================
-- 4. Partial index til sales-analytics "afviste tilbud pr. aarsag"
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_offers_rejection_reason
  ON offers(rejection_reason)
  WHERE rejection_reason IS NOT NULL;

-- =====================================================
-- 5. Selv-dokumenterende kommentarer
-- =====================================================
COMMENT ON COLUMN offers.rejection_reason IS
  'Phase 12A (00121): kategorisk aarsag fra dropdown — én af: price_too_high, chose_competitor, paused, doesnt_match, other. NULL for historiske rejects fra foer 00121.';

COMMENT ON COLUMN offers.rejection_note IS
  'Phase 12A (00121): fri-tekst bemaerkning fra kunde ved afvis. Separat fra offers.notes (intern-noter). Max 2000 chars (haandhaeves i app-laget, ikke DB).';

COMMENT ON COLUMN offers.rejected_by_name IS
  'Phase 12A (00121): valgfrit navn indtastet af kunde ved reject. NULL hvis kunde forblev anonym.';

COMMENT ON COLUMN offers.rejected_by_email IS
  'Phase 12A (00121): valgfri email indtastet af kunde ved reject. NULL hvis kunde forblev anonym.';

COMMENT ON COLUMN offers.rejected_by_ip IS
  'Phase 12A (00121): IP fra x-forwarded-for ved reject-submit. Best-effort audit-trail mod fraud/competitor-misbrug. NULL hvis capture fejlede.';

COMMENT ON COLUMN offers.rejected_by_user_agent IS
  'Phase 12A (00121): User-Agent header ved reject-submit. Audit nice-to-have. NULL hvis ikke fanget.';

NOTIFY pgrst, 'reload schema';

COMMIT;
