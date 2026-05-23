-- =====================================================
-- 00116: Recover customer_contacts.role (Sprint 10B)
--
-- Genskaber repo-migration for kolonne der ALLEREDE findes i production.
-- Verificeret via read-only schema-audit:
--   - customer_contacts.role  TEXT NULL
--   - CHECK constraint: (role IS NULL OR role IN (
--       'billing','ordering','site','technical',
--       'resident','property_manager','other'))
--   - idx_customer_contacts_role  partial WHERE NOT NULL
--
-- TS-side (src/types/customers.types.ts:40-48) matcher ALLEREDE prod-CHECK
-- praecis — ingen kode-aendringer kraevet. Sprint 10B Trin 2-D er moot.
--
-- Data-snapshot (Sprint 10B Trin 1B):
--   - 6 rows har role sat (3 = 'site', 3 = 'billing')
--   - 0 rows har NULL eller invalid role
--   - prod-CHECK haandhaeves korrekt
--
-- Migrationen er FULDT IDEMPOTENT. Forventet adfaerd i prod:
--   - 0 kolonner tilfoejet
--   - 0 constraints aendret (named-constraint findes allerede)
--   - 0 indexes tilfoejet
--
-- INGEN UPDATE. INGEN datamigrering. Eksisterende role-vaerdier bevares.
-- =====================================================

BEGIN;

-- 1. role-kolonne
ALTER TABLE customer_contacts
  ADD COLUMN IF NOT EXISTS role TEXT;

-- 2. CHECK constraint matchende prod
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'customer_contacts_role_check'
      AND conrelid = 'customer_contacts'::regclass
  ) THEN
    ALTER TABLE customer_contacts
      ADD CONSTRAINT customer_contacts_role_check
      CHECK (
        role IS NULL OR role IN (
          'billing',
          'ordering',
          'site',
          'technical',
          'resident',
          'property_manager',
          'other'
        )
      );
  END IF;
END $$;

-- 3. Partial index
CREATE INDEX IF NOT EXISTS idx_customer_contacts_role
  ON customer_contacts(role)
  WHERE role IS NOT NULL;

-- 4. Selv-dokumenterende kommentar
COMMENT ON COLUMN customer_contacts.role IS
  'Kontakt-rolle. Tilladte vaerdier: billing/ordering/site/technical/resident/property_manager/other. Matcher TS CUSTOMER_CONTACT_ROLES. Genskabt i 00116.';

NOTIFY pgrst, 'reload schema';

COMMIT;
