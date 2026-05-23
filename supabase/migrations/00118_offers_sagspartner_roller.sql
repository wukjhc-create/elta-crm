-- =====================================================
-- 00118: Offers sagspartner-roller (Sprint 12A Fase 1)
--
-- Goer offers sagspartner-aware ved at tilfoeje 3 parti-rolle-FK'er
-- + billing_mode-CHECK matchende service_cases-modellen (00112).
--
-- Forretningsmotivation:
--   Det eksisterende offers-skema har kun customer_id. Det betyder at
--   tilbud ikke kan håndtere Mikma-scenariet:
--     - Mikma er bestiller/betaler
--     - Lars Peter er anlaegsejer/slutkunde
--   I dag faar tilbuds-mail kun ÉN modtager via customer_id.
--
-- SCOPE i Sprint 12A:
--   - orderer_customer_id (bestiller/ordregiver)
--   - end_customer_id (slutkunde/anlaegsejer)
--   - payer_customer_id (betaler)
--   - billing_mode (samme enum som service_cases)
--
-- BEVIDST UDELADT i denne sprint (kan tilfoejes senere ved behov):
--   - site_customer_id     (leveringskunde — hoerer mest til sag)
--   - site_contact_id      (kontakt paa stedet — hoerer mest til sag)
--   - purchased_from_customer_id (forhandler — sjaelden brug paa tilbud)
--   - service_case_id      (omvendt FK eksisterer allerede via
--                           service_cases.source_offer_id)
--
-- IDEMPOTENS:
--   - ADD COLUMN IF NOT EXISTS
--   - DO-block + pg_constraint-tjek for FK + CHECK
--   - CREATE INDEX IF NOT EXISTS
--   - Backfill via COALESCE — paavirker kun rows hvor felter er NULL
--
-- ON DELETE-strategi:
--   - Nye parti-FK'er bruger ON DELETE SET NULL.
--   - Eksisterende customer_id-FK bevarer sit ON DELETE CASCADE
--     (uaendret i denne sprint — separat beslutning hvis vi vil aendre).
--
-- BACKFILL:
--   - 19 eksisterende offers i prod (verificeret 23. maj 2026)
--   - Alle 19 har customer_id sat
--   - Backfill saetter alle 3 parti-roller = customer_id og
--     billing_mode = 'same_as_customer'
--   - Mail-routing-adfaerd forbliver derfor IDENTISK med før migrationen
--     for eksisterende tilbud (verificerbart via Phase 6a shadow-log)
--
-- =====================================================

BEGIN;

-- 1. Tilfoej parti-rolle-FK'er
ALTER TABLE offers
  ADD COLUMN IF NOT EXISTS orderer_customer_id UUID,
  ADD COLUMN IF NOT EXISTS end_customer_id UUID,
  ADD COLUMN IF NOT EXISTS payer_customer_id UUID,
  ADD COLUMN IF NOT EXISTS billing_mode TEXT DEFAULT 'same_as_customer';

-- 2. Foreign key constraints — idempotent via pg_constraint-tjek
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'offers_orderer_customer_id_fkey'
      AND conrelid = 'offers'::regclass
  ) THEN
    ALTER TABLE offers
      ADD CONSTRAINT offers_orderer_customer_id_fkey
      FOREIGN KEY (orderer_customer_id)
      REFERENCES customers(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'offers_end_customer_id_fkey'
      AND conrelid = 'offers'::regclass
  ) THEN
    ALTER TABLE offers
      ADD CONSTRAINT offers_end_customer_id_fkey
      FOREIGN KEY (end_customer_id)
      REFERENCES customers(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'offers_payer_customer_id_fkey'
      AND conrelid = 'offers'::regclass
  ) THEN
    ALTER TABLE offers
      ADD CONSTRAINT offers_payer_customer_id_fkey
      FOREIGN KEY (payer_customer_id)
      REFERENCES customers(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- 3. CHECK constraint paa billing_mode — matcher service_cases (00112)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'offers_billing_mode_check'
      AND conrelid = 'offers'::regclass
  ) THEN
    ALTER TABLE offers
      ADD CONSTRAINT offers_billing_mode_check
      CHECK (billing_mode IN (
        'same_as_customer',
        'orderer_pays',
        'end_customer_pays',
        'third_party_pays',
        'unknown'
      ));
  END IF;
END $$;

-- 4. Partial indexes (matcher 00112-pattern)
CREATE INDEX IF NOT EXISTS idx_offers_orderer_customer_id
  ON offers(orderer_customer_id)
  WHERE orderer_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_offers_end_customer_id
  ON offers(end_customer_id)
  WHERE end_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_offers_payer_customer_id
  ON offers(payer_customer_id)
  WHERE payer_customer_id IS NOT NULL;

-- 5. Backfill: peg alle nye parti-roller paa customer_id for eksisterende
--    offers. Bruger COALESCE saa rows der allerede har faaet parti-roller
--    sat (fx via en fremtidig re-run af migrationen) ikke overskrives.
UPDATE offers
SET
  orderer_customer_id = COALESCE(orderer_customer_id, customer_id),
  end_customer_id     = COALESCE(end_customer_id, customer_id),
  payer_customer_id   = COALESCE(payer_customer_id, customer_id),
  billing_mode        = COALESCE(billing_mode, 'same_as_customer')
WHERE customer_id IS NOT NULL;

-- 6. Selv-dokumenterende kommentarer
COMMENT ON COLUMN offers.orderer_customer_id IS
  'Sprint 12A: bestiller / ordregiver paa tilbuddet. Default = customer_id ved backfill. Mail-routing bruger denne ved billing_mode=orderer_pays eller same_as_customer.';

COMMENT ON COLUMN offers.end_customer_id IS
  'Sprint 12A: slutkunde / anlaegsejer. Kan = orderer ved B2C. Bruges ved billing_mode=end_customer_pays.';

COMMENT ON COLUMN offers.payer_customer_id IS
  'Sprint 12A: betaler. Bruges ved billing_mode=third_party_pays. Default = customer_id.';

COMMENT ON COLUMN offers.billing_mode IS
  'Sprint 12A: deskriptiv markering af betaler-relation. Matcher service_cases.billing_mode-enum. Mail-routing-resolver konsulterer denne for at vaelge default modtager-rolle.';

-- 7. Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';

COMMIT;
