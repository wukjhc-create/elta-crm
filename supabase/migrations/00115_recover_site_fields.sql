-- =====================================================
-- 00115: Recover service_cases site-felter (Sprint 10B)
--
-- Genskaber repo-migration for felter der ALLEREDE findes i production
-- men aldrig er blevet checked-in. Verificeret via read-only schema-audit
-- (scripts/inspect-10b-schema.mjs + snapshot-10b-data.mjs):
--   - service_cases.site_customer_id      UUID NULL, FK customers (SET NULL)
--   - service_cases.site_contact_id       UUID NULL, FK customer_contacts (SET NULL)
--   - idx_service_cases_site_customer_id  partial WHERE NOT NULL
--   - idx_service_cases_site_contact_id   partial WHERE NOT NULL
--
-- Migrationen er FULDT IDEMPOTENT — ADD COLUMN IF NOT EXISTS + DO-block
-- til FK + CREATE INDEX IF NOT EXISTS. Forventet adfaerd i prod:
--   - 0 kolonner tilfoejet
--   - 0 FK'er tilfoejet
--   - 0 indexes tilfoejet
--
-- Forventet adfaerd i clean rebuild (lokalt/staging):
--   - 2 kolonner tilfoejet med korrekt FK + delete-rule
--   - 2 partial indexes
--
-- INGEN UPDATE. INGEN datamigrering. Eksisterende data bevares uaendret.
-- =====================================================

BEGIN;

-- 1. site_customer_id — leveringskunde / slutkunde hvis forskellig fra betaler
ALTER TABLE service_cases
  ADD COLUMN IF NOT EXISTS site_customer_id UUID;

-- 2. site_contact_id — kontaktperson paa stedet (FK customer_contacts)
ALTER TABLE service_cases
  ADD COLUMN IF NOT EXISTS site_contact_id UUID;

-- 3. Foreign key constraints — idempotent via pg_constraint-tjek
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'service_cases_site_customer_id_fkey'
      AND conrelid = 'service_cases'::regclass
  ) THEN
    ALTER TABLE service_cases
      ADD CONSTRAINT service_cases_site_customer_id_fkey
      FOREIGN KEY (site_customer_id)
      REFERENCES customers(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'service_cases_site_contact_id_fkey'
      AND conrelid = 'service_cases'::regclass
  ) THEN
    ALTER TABLE service_cases
      ADD CONSTRAINT service_cases_site_contact_id_fkey
      FOREIGN KEY (site_contact_id)
      REFERENCES customer_contacts(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- 4. Partial indexes (matcher prod-mønster)
CREATE INDEX IF NOT EXISTS idx_service_cases_site_customer_id
  ON service_cases(site_customer_id)
  WHERE site_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_service_cases_site_contact_id
  ON service_cases(site_contact_id)
  WHERE site_contact_id IS NOT NULL;

-- 5. Selv-dokumenterende kommentarer
COMMENT ON COLUMN service_cases.site_customer_id IS
  'Leveringskunde / slutkunde hvis forskellig fra betaler. NULL = samme som customer_id. Genskabt i 00115.';
COMMENT ON COLUMN service_cases.site_contact_id IS
  'Kontaktperson paa stedet (FK customer_contacts). Genskabt i 00115.';

NOTIFY pgrst, 'reload schema';

COMMIT;
