-- =====================================================
-- 00117: customer_documents.service_case_id + besigtigelse-type
--         (Sprint 10B — supersedes 00114)
--
-- Erstatter den tidligere uncommitted 00114 som var delvist out-of-sync
-- med production. Verificeret via Sprint 10B read-only schema-audit:
--
-- HVAD FINDES ALLEREDE I PROD:
--   - customer_documents.service_case_id    UUID NULL
--   - FK customer_documents_service_case_id_fkey  → service_cases(id) ON DELETE SET NULL
--   - idx_customer_documents_service_case   partial index WHERE NOT NULL
--   - customer_documents.source_email_id    UUID NULL (sideeffekt af andre migrations)
--
-- HVAD MANGLER I PROD (denne migration tilfoejer):
--   - document_type CHECK skal udvides til at acceptere 'besigtigelse'
--     (i dag accepterer den kun quote/invoice/contract/other)
--
-- Phase 9H Phase A-koden i besigtigelse.ts insert'er document_type='besigtigelse'
-- — den vil fejle indtil denne migration koeres. Det er den vigtige del.
--
-- Data-snapshot (Sprint 10B Trin 1B):
--   - 0 rows har document_type='besigtigelse' i dag (sikkert at udvide CHECK)
--   - 3 rows har title 'Besigtigelsesrapport…' under document_type='other'
--     (legacy testdata, IKKE migreret i denne sprint per beslutning)
--   - 0 orphan service_case_id-vaerdier (FK haandhaeves)
--
-- Migrationen er IDEMPOTENT:
--   - ADD COLUMN IF NOT EXISTS  (no-op i prod)
--   - FK via pg_constraint-tjek (no-op i prod)
--   - CREATE INDEX IF NOT EXISTS (no-op i prod)
--   - DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT (idempotent CHECK-udvidelse)
--
-- INGEN UPDATE. INGEN datamigrering af legacy 'other'-besigtigelser
-- (per Sprint 10B-beslutning). Eksisterende data bevares uaendret.
-- =====================================================

BEGIN;

-- 1. service_case_id-kolonne
ALTER TABLE customer_documents
  ADD COLUMN IF NOT EXISTS service_case_id UUID;

-- 2. Foreign key constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'customer_documents_service_case_id_fkey'
      AND conrelid = 'customer_documents'::regclass
  ) THEN
    ALTER TABLE customer_documents
      ADD CONSTRAINT customer_documents_service_case_id_fkey
      FOREIGN KEY (service_case_id)
      REFERENCES service_cases(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- 3. Partial index — match prod-naming-convention
CREATE INDEX IF NOT EXISTS idx_customer_documents_service_case
  ON customer_documents(service_case_id)
  WHERE service_case_id IS NOT NULL;

-- 4. Udvid document_type CHECK til at inkludere 'besigtigelse'
--    Vigtigt: Drop'er kun den named constraint vi kender; hvis prod har
--    et andet navn, gaar dette stille forbi pga. IF EXISTS.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'customer_documents_document_type_check'
      AND conrelid = 'customer_documents'::regclass
  ) THEN
    ALTER TABLE customer_documents
      DROP CONSTRAINT customer_documents_document_type_check;
  END IF;
END $$;

ALTER TABLE customer_documents
  ADD CONSTRAINT customer_documents_document_type_check
  CHECK (document_type IN ('quote', 'invoice', 'contract', 'besigtigelse', 'other'));

-- 5. Selv-dokumenterende kommentar
COMMENT ON COLUMN customer_documents.service_case_id IS
  'Sprint 9H/10B: kobler dokumentet til en service_case saa sagspartner-roller (orderer/end_customer/payer/site_contact) kan slaas op ved gen-send. NULL = ikke koblet. Genskabt i 00117.';

NOTIFY pgrst, 'reload schema';

COMMIT;
