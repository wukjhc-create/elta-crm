-- =====================================================
-- 00112: Sagspartner-model — ordregiver, slutkunde, betaler, koebssted
-- Sprint 9E Phase 1
--
-- Additiv migration. Alle nye felter er nullable og FK ON DELETE SET NULL.
-- Bevarer eksisterende service_cases.customer_id 1:1 — gamle sager
-- og eksisterende mail-routing aendrer adfaerd ikke. Backfill peger
-- alle nye roller paa customer_id som "direct_customer".
--
-- Forudsaetning: migration 00111 (site_customer_id + site_contact_id)
-- maa vaere koert i prod. Filen ses ikke i repoet, men kolonnerne
-- refereres i src/types/service-cases.types.ts. DO-block nedenfor
-- haandterer sikkert om site_customer_id faktisk findes som kolonne.
-- =====================================================

BEGIN;

-- 1. Nye partner-FK'er + billing_mode
ALTER TABLE service_cases
  ADD COLUMN IF NOT EXISTS orderer_customer_id UUID
    REFERENCES customers(id) ON DELETE SET NULL;

ALTER TABLE service_cases
  ADD COLUMN IF NOT EXISTS end_customer_id UUID
    REFERENCES customers(id) ON DELETE SET NULL;

ALTER TABLE service_cases
  ADD COLUMN IF NOT EXISTS payer_customer_id UUID
    REFERENCES customers(id) ON DELETE SET NULL;

ALTER TABLE service_cases
  ADD COLUMN IF NOT EXISTS purchased_from_customer_id UUID
    REFERENCES customers(id) ON DELETE SET NULL;

ALTER TABLE service_cases
  ADD COLUMN IF NOT EXISTS purchase_source TEXT;

ALTER TABLE service_cases
  ADD COLUMN IF NOT EXISTS billing_mode TEXT
    DEFAULT 'same_as_customer';

-- 2. CHECK constraint paa billing_mode — tilfoejes som named constraint
--    saa den kan droppes uafhaengigt i rollback. IF NOT EXISTS-pattern
--    via DO-block fordi PostgreSQL ikke understoetter "ADD CONSTRAINT
--    IF NOT EXISTS" foer 15.x.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'service_cases_billing_mode_check'
      AND conrelid = 'service_cases'::regclass
  ) THEN
    ALTER TABLE service_cases
      ADD CONSTRAINT service_cases_billing_mode_check
      CHECK (billing_mode IN (
        'same_as_customer',
        'orderer_pays',
        'end_customer_pays',
        'third_party_pays',
        'unknown'
      ));
  END IF;
END $$;

-- 3. Partial indexes (kun rows hvor FK er sat)
CREATE INDEX IF NOT EXISTS idx_service_cases_orderer_customer_id
  ON service_cases(orderer_customer_id)
  WHERE orderer_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_service_cases_end_customer_id
  ON service_cases(end_customer_id)
  WHERE end_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_service_cases_payer_customer_id
  ON service_cases(payer_customer_id)
  WHERE payer_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_service_cases_purchased_from_customer_id
  ON service_cases(purchased_from_customer_id)
  WHERE purchased_from_customer_id IS NOT NULL;

-- 4. Kommentarer (selv-dokumenterende schema)
COMMENT ON COLUMN service_cases.orderer_customer_id IS
  'Sprint 9E: ordregiver — den der bestilte opgaven. Default = customer_id ved backfill.';
COMMENT ON COLUMN service_cases.end_customer_id IS
  'Sprint 9E: slutkunde / anlaegsejer. Kan vaere = orderer ved B2C.';
COMMENT ON COLUMN service_cases.payer_customer_id IS
  'Sprint 9E: hvem faar tilbud/faktura. Mail-router bruger denne fra Phase 6.';
COMMENT ON COLUMN service_cases.purchased_from_customer_id IS
  'Sprint 9E: forhandler / koebssted hvis customer-row findes. Faar ALDRIG mail automatisk.';
COMMENT ON COLUMN service_cases.purchase_source IS
  'Sprint 9E: fritekst-koebssted hvis ingen customer-row passer ("Direkte", "Bilka").';
COMMENT ON COLUMN service_cases.billing_mode IS
  'Sprint 9E: deskriptiv markering af payer-relation. Autoritativ kilde er payer_customer_id.';

-- 5. Safe backfill
-- Peger nye felter paa eksisterende customer_id saa gamle sager
-- fungerer uaendret. site_customer_id-kolonnen kan vaere fravaerende
-- (migration 00111 ikke checked in lokalt) — DO-block haandterer
-- begge tilfaelde.
DO $$
DECLARE
  has_site_customer BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'service_cases'
      AND column_name = 'site_customer_id'
  ) INTO has_site_customer;

  IF has_site_customer THEN
    UPDATE service_cases
    SET
      orderer_customer_id = COALESCE(orderer_customer_id, customer_id),
      end_customer_id     = COALESCE(end_customer_id, site_customer_id, customer_id),
      payer_customer_id   = COALESCE(payer_customer_id, customer_id),
      billing_mode        = COALESCE(billing_mode, 'same_as_customer')
    WHERE customer_id IS NOT NULL;
  ELSE
    -- site_customer_id mangler — end_customer falder direkte tilbage paa customer_id
    RAISE NOTICE 'site_customer_id column missing — end_customer_id backfill uses customer_id directly';
    UPDATE service_cases
    SET
      orderer_customer_id = COALESCE(orderer_customer_id, customer_id),
      end_customer_id     = COALESCE(end_customer_id, customer_id),
      payer_customer_id   = COALESCE(payer_customer_id, customer_id),
      billing_mode        = COALESCE(billing_mode, 'same_as_customer')
    WHERE customer_id IS NOT NULL;
  END IF;
END $$;

COMMIT;

-- 6. Genindlaes PostgREST schema cache saa Supabase-clienten ser nye kolonner
NOTIFY pgrst, 'reload schema';
