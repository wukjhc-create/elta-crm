-- =====================================================
-- Migration 00084: Accounting integration (Phase 5.4)
--
-- Provider-agnostic settings + sync log. First (and currently only)
-- supported provider is e-conomic.
-- =====================================================

CREATE TABLE IF NOT EXISTS accounting_integration_settings (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider                TEXT NOT NULL UNIQUE,        -- 'economic'
  api_token               TEXT,                        -- e-conomic X-AppSecretToken
  agreement_grant_token   TEXT,                        -- e-conomic X-AgreementGrantToken
  active                  BOOLEAN NOT NULL DEFAULT true,
  last_sync_at            TIMESTAMPTZ,
  config                  JSONB NOT NULL DEFAULT '{}'::jsonb,  -- numeric defaults: layoutNumber, paymentTermsNumber, vatZoneNumber, defaultProductNumber, cashbookNumber, bankContraAccountNumber
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS accounting_sync_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider        TEXT NOT NULL,
  entity_type     TEXT NOT NULL CHECK (entity_type IN ('customer','invoice','payment')),
  entity_id       UUID NOT NULL,
  action          TEXT NOT NULL CHECK (action IN ('create','update','mark_paid','skip')),
  status          TEXT NOT NULL CHECK (status IN ('success','failed','skipped')),
  external_id     TEXT,
  error_message   TEXT,
  request_meta    JSONB,
  response_meta   JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_acc_sync_log_entity
  ON accounting_sync_log(entity_type, entity_id, created_at DESC);

ALTER TABLE accounting_integration_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_sync_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "acc_settings_select_auth" ON accounting_integration_settings;
CREATE POLICY "acc_settings_select_auth" ON accounting_integration_settings
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "acc_sync_log_select_auth" ON accounting_sync_log;
CREATE POLICY "acc_sync_log_select_auth" ON accounting_sync_log
  FOR SELECT TO authenticated USING (true);

GRANT SELECT ON accounting_integration_settings TO authenticated;
GRANT ALL ON accounting_integration_settings TO service_role;
GRANT SELECT ON accounting_sync_log TO authenticated;
GRANT ALL ON accounting_sync_log TO service_role;

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_acc_settings_updated_at ON accounting_integration_settings;
CREATE TRIGGER trg_acc_settings_updated_at
  BEFORE UPDATE ON accounting_integration_settings
  FOR EACH ROW EXECUTE FUNCTION invoices_set_updated_at();

-- External id columns on the entities we sync.
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS external_invoice_id TEXT,
  ADD COLUMN IF NOT EXISTS external_provider   TEXT;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS external_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS external_provider    TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_external
  ON invoices(external_provider, external_invoice_id)
  WHERE external_invoice_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_external
  ON customers(external_provider, external_customer_id)
  WHERE external_customer_id IS NOT NULL;
