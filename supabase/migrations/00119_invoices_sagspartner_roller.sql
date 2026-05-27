-- =====================================================
-- 00119: Invoices sagspartner-roller (Sprint 13A.1)
--
-- Goer invoices sagspartner-aware ved at tilfoeje 3 parti-rolle-FK'er
-- + billing_mode-CHECK matchende offers-modellen (00118) og
-- service_cases-modellen (00112).
--
-- Forretningsmotivation:
--   Det eksisterende invoices-skema har kun customer_id. Det betyder
--   at fakturaer ikke kan haandtere Mikma-/B2B2C-scenariet:
--     - Mikma er bestiller/betaler (skal modtage faktura)
--     - Lars Peter er anlaegsejer/slutkunde (skal IKKE modtage faktura)
--   I dag faar faktura-mail og e-conomic-debitor kun customer_id, som
--   ofte peger paa primary kunde, ikke betaler.
--
-- SCOPE i Sprint 13A.1:
--   - Kun DB-schema + backfill + types + PGRST201-disambig i
--     resolveInvoiceMailRoute.
--   - Ingen aendring i action-, PDF- eller UI-laget (kommer i 13A.2/3).
--
-- BEVIDST UDELADT (daekkes af 13A.2 og senere):
--   - Action-laget der bruger felterne (invoice-from-case, autopilot)
--   - PDF-template viser stadig customer_id (Sprint 13A.3)
--   - E-conomic-mapping (Sprint 13B)
--
-- IDEMPOTENS:
--   - ADD COLUMN IF NOT EXISTS for alle 4 felter
--   - DO-block + pg_constraint-tjek for FK + CHECK
--   - DO-block for SET NOT NULL paa billing_mode (idempotent guard)
--   - CREATE INDEX IF NOT EXISTS for partial indexes
--   - Backfill via COALESCE — paavirker kun NULL-felter
--
-- ON DELETE-strategi:
--   - Nye parti-FK'er bruger ON DELETE SET NULL (matcher 00118).
--   - Eksisterende customer_id-FK bevarer sit ON DELETE SET NULL
--     (uaendret fra 00080).
--
-- BACKFILL:
--   - Alle eksisterende invoices med customer_id NOT NULL faar alle 3
--     parti-roller = customer_id og billing_mode = 'same_as_customer'.
--   - Orphan-invoices (customer_id IS NULL via tidligere
--     ON DELETE SET NULL) faar billing_mode-default men ikke
--     parti-roller — action-laget i 13A.2 skal handle disse safe.
--   - Faktura-routing-adfaerd forbliver IDENTISK med foer migrationen
--     for eksisterende fakturaer (verificeres efter 13A.2).
--
-- BILLING_MODE NOT NULL:
--   - Brugeren har bedt om NOT NULL pa billing_mode.
--   - Tilfoejes som separat step EFTER backfill saa migration ikke
--     fejler hvis tabellen har NULL-rows (defensive pattern).
-- =====================================================

BEGIN;

-- 1. Tilfoej parti-rolle-FK'er + billing_mode
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS orderer_customer_id UUID,
  ADD COLUMN IF NOT EXISTS end_customer_id UUID,
  ADD COLUMN IF NOT EXISTS payer_customer_id UUID,
  ADD COLUMN IF NOT EXISTS billing_mode TEXT DEFAULT 'same_as_customer';

-- 2. Foreign key constraints — idempotent via pg_constraint-tjek
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'invoices_orderer_customer_id_fkey'
      AND conrelid = 'invoices'::regclass
  ) THEN
    ALTER TABLE invoices
      ADD CONSTRAINT invoices_orderer_customer_id_fkey
      FOREIGN KEY (orderer_customer_id)
      REFERENCES customers(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'invoices_end_customer_id_fkey'
      AND conrelid = 'invoices'::regclass
  ) THEN
    ALTER TABLE invoices
      ADD CONSTRAINT invoices_end_customer_id_fkey
      FOREIGN KEY (end_customer_id)
      REFERENCES customers(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'invoices_payer_customer_id_fkey'
      AND conrelid = 'invoices'::regclass
  ) THEN
    ALTER TABLE invoices
      ADD CONSTRAINT invoices_payer_customer_id_fkey
      FOREIGN KEY (payer_customer_id)
      REFERENCES customers(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- 3. CHECK constraint paa billing_mode — matcher offers (00118)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'invoices_billing_mode_check'
      AND conrelid = 'invoices'::regclass
  ) THEN
    ALTER TABLE invoices
      ADD CONSTRAINT invoices_billing_mode_check
      CHECK (billing_mode IN (
        'same_as_customer',
        'orderer_pays',
        'end_customer_pays',
        'third_party_pays',
        'unknown'
      ));
  END IF;
END $$;

-- 4. Partial indexes (matcher 00118-pattern)
CREATE INDEX IF NOT EXISTS idx_invoices_orderer_customer_id
  ON invoices(orderer_customer_id)
  WHERE orderer_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_end_customer_id
  ON invoices(end_customer_id)
  WHERE end_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_payer_customer_id
  ON invoices(payer_customer_id)
  WHERE payer_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_billing_mode
  ON invoices(billing_mode);

-- 5. Backfill: peg alle nye parti-roller paa customer_id for eksisterende
--    invoices. COALESCE sikrer at evt. allerede-sat split-data ikke
--    overskrives (defensiv mod re-run).
UPDATE invoices
SET
  orderer_customer_id = COALESCE(orderer_customer_id, customer_id),
  end_customer_id     = COALESCE(end_customer_id, customer_id),
  payer_customer_id   = COALESCE(payer_customer_id, customer_id),
  billing_mode        = COALESCE(billing_mode, 'same_as_customer')
WHERE customer_id IS NOT NULL;

-- 6. SET NOT NULL paa billing_mode EFTER backfill — idempotent
--    Sanity-guard sikrer at vi ikke saetter NOT NULL hvis der trods
--    backfill stadig findes NULL-rows (umuligt med DEFAULT-clausen,
--    men defensiv mod schema-anomalier).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'invoices'
      AND column_name = 'billing_mode'
      AND is_nullable = 'YES'
  ) THEN
    IF NOT EXISTS (SELECT 1 FROM invoices WHERE billing_mode IS NULL) THEN
      ALTER TABLE invoices ALTER COLUMN billing_mode SET NOT NULL;
    END IF;
  END IF;
END $$;

-- 7. Selv-dokumenterende kommentarer
COMMENT ON COLUMN invoices.orderer_customer_id IS
  'Sprint 13A: bestiller / ordregiver paa fakturaen. Default = customer_id ved backfill. Mail-routing og e-conomic-mapping bruger denne ved billing_mode=orderer_pays.';

COMMENT ON COLUMN invoices.end_customer_id IS
  'Sprint 13A: slutkunde / anlaegsejer. Kan = orderer ved B2C. Bruges ved billing_mode=end_customer_pays.';

COMMENT ON COLUMN invoices.payer_customer_id IS
  'Sprint 13A: betaler. Bruges ved billing_mode=third_party_pays. E-conomic-debitor mappes herfra (Sprint 13B). Default = customer_id.';

COMMENT ON COLUMN invoices.billing_mode IS
  'Sprint 13A: deskriptiv markering af betaler-relation. Matcher offers.billing_mode (00118) og service_cases.billing_mode (00112)-enum. Faktura-mail-routing konsulterer denne i Sprint 13A.2.';

-- 8. Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';

COMMIT;
