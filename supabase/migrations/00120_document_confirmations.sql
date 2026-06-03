-- =====================================================
-- 00120: document_confirmations
--         Phase B1 — kundebekraeftelse af customer_documents.
--
-- Foerste use-case: besigtigelsesrapporter (Mikma/Lars Peter-scenariet hvor
-- ordregiver, betaler, anlaegsejer og kontaktperson kan vaere forskellige
-- parter, og bekraeftelse skal komme fra én eller flere af dem).
-- Tabellen er bevidst generisk: kan bruges til andre document_types
-- senere uden schema-aendring.
--
-- ARKITEKTUR-NOTER:
--
--  1. Én row per (dokument, modtager). Hver modtager faar sin egen token
--     med egen expiry. Hvis 3 sagspartnere skal bekraefte, oprettes 3
--     rows ved send.
--
--  2. Token-validering sker UDELUKKENDE server-side via createAdminClient
--     (service-role bypasser RLS i server actions). Anon-rolle har INGEN
--     policies — hverken SELECT, INSERT, UPDATE eller DELETE. RLS er
--     sidste forsvarslinje hvis service-role-noeglen ved en fejl tabes.
--
--  3. 'expired' findes IKKE som status-vaerdi. Det beregnes ad-hoc fra
--     (expires_at < NOW() AND status IN ('sent','opened')). Det eliminerer
--     behov for cron til at flytte status og holder DB-state simpel.
--
--  4. Token er plain TEXT (64 hex chars fra gen_random_bytes(32)). Samme
--     niveau som portal_access_tokens. token_hash kan tilfoejes i Phase B2
--     hvis trusselsbillede aendres — ikke noedvendigt for B1.
--
--  5. customer_documents er IKKE aendret. Ingen ny kolonne der. Status pr.
--     dokument aggregeres via JOIN paa document_confirmations.
--
-- IDEMPOTENT:
--   - CREATE TABLE IF NOT EXISTS
--   - CREATE INDEX IF NOT EXISTS
--   - Policy via DROP POLICY IF EXISTS + CREATE POLICY (idempotent)
--   - INGEN UPDATE, INGEN DELETE, INGEN aendring til eksisterende tabeller
-- =====================================================

BEGIN;

-- =====================================================
-- 1. Tabel
-- =====================================================
CREATE TABLE IF NOT EXISTS document_confirmations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Relations
  customer_document_id UUID NOT NULL REFERENCES customer_documents(id) ON DELETE CASCADE,
  service_case_id UUID REFERENCES service_cases(id) ON DELETE SET NULL,

  -- Token (server-side validation only — se header-note 2)
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),

  -- Recipient (snapshot ved oprettelse — ikke source-of-truth-link)
  recipient_type TEXT NOT NULL CHECK (recipient_type IN ('customer','contact','manual')),
  recipient_customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  recipient_contact_id UUID REFERENCES customer_contacts(id) ON DELETE SET NULL,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  recipient_role TEXT NOT NULL CHECK (recipient_role IN (
    'orderer','payer','end_customer','site_customer','site_contact','document_customer','manual'
  )),

  -- Livscyklus (note: 'expired' er IKKE en status-vaerdi — se header-note 3)
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending','sent','failed','opened','confirmed','revoked'
  )),
  expires_at TIMESTAMPTZ NOT NULL,

  -- Mail-send outcome
  mail_sent_at TIMESTAMPTZ,
  mail_error TEXT,

  -- Open-tracking
  first_opened_at TIMESTAMPTZ,
  last_opened_at TIMESTAMPTZ,
  open_count INT NOT NULL DEFAULT 0,

  -- Bekraeftelse
  confirmed_at TIMESTAMPTZ,
  confirmed_by_name TEXT,
  confirmed_by_email TEXT,
  confirmation_note TEXT,
  confirmed_ip TEXT,
  confirmed_user_agent TEXT,

  -- Annullering (medarbejder kan revoke en ikke-bekraeftet token)
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_reason TEXT,

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- =====================================================
-- 2. Indekser
-- =====================================================

-- Liste/aggregat-query: "alle confirmations for dette dokument" + filter paa status
CREATE INDEX IF NOT EXISTS idx_document_confirmations_document_status
  ON document_confirmations(customer_document_id, status);

-- Sag-tidslinje: "alle confirmations for denne sag"
CREATE INDEX IF NOT EXISTS idx_document_confirmations_service_case
  ON document_confirmations(service_case_id)
  WHERE service_case_id IS NOT NULL;

-- Dedupe-tjek ved send: "har vi allerede en aktiv confirmation til denne email for dette dok"
CREATE INDEX IF NOT EXISTS idx_document_confirmations_document_recipient
  ON document_confirmations(customer_document_id, recipient_email);

-- Expiry-scan (kun aktive rows — ikke confirmed/failed/revoked)
CREATE INDEX IF NOT EXISTS idx_document_confirmations_expires_pending
  ON document_confirmations(expires_at)
  WHERE status IN ('pending','sent','opened');

-- =====================================================
-- 3. RLS
-- =====================================================
ALTER TABLE document_confirmations ENABLE ROW LEVEL SECURITY;

-- Eneste policy: authenticated brugere full access.
-- INGEN policy for anon-rolle — RLS afviser anon komplet.
-- Public confirm-flow gaar via server actions med createAdminClient.
DROP POLICY IF EXISTS "Authenticated full access" ON document_confirmations;
CREATE POLICY "Authenticated full access" ON document_confirmations
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- =====================================================
-- 4. Selv-dokumenterende kommentarer
-- =====================================================
COMMENT ON TABLE document_confirmations IS
  'Phase B1 (00120): kundebekraeftelse pr. modtager pr. dokument. Token-validering sker server-side via createAdminClient. Anon-rolle har ingen direkte adgang. expired-state beregnes ad-hoc fra expires_at < NOW().';

COMMENT ON COLUMN document_confirmations.token IS
  '64 hex chars (32 random bytes). Plain text — kompromitteret DB lekker tokens, men 30-dages expiry + per-document scope begraenser blast radius. token_hash kan tilfoejes i Phase B2 hvis trusselsbillede aendres.';

COMMENT ON COLUMN document_confirmations.status IS
  'pending=row oprettet, mail ikke afsendt endnu. sent=mail leveret til Graph. failed=mail-send fejlede. opened=public side besoegt. confirmed=modtager bekraeftede. revoked=medarbejder annullerede. expired er IKKE en status — beregnes som expires_at < NOW() AND status IN (sent,opened).';

COMMENT ON COLUMN document_confirmations.recipient_role IS
  'Sagspartner-rolle for visning paa public confirm-side. document_customer = fallback til doc.customer (kunde paa dokumentet). manual = ekstern email indtastet manuelt af medarbejder.';

COMMENT ON COLUMN document_confirmations.expires_at IS
  'App-koden saetter (typisk NOW() + 30 dage). Ingen DB-default — tvinger app til at vaelge bevidst. Bruges baade i UI ("udloeber om X dage") og i server action guard paa submitConfirmation.';

NOTIFY pgrst, 'reload schema';

COMMIT;
