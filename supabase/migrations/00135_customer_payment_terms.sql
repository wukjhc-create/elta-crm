-- =====================================================================
-- 00135: Sprint 2E.2A — betalingsfrist pr. kunde (+ company default)
-- =====================================================================
--
-- FORMÅL
--   Indfør betalingsfrist-override pr. kunde + en company-wide default,
--   så faktura-due_date kan resolves: customer → company → 14 dage.
--
-- KOLONNER (additive)
--   customers.payment_terms_days            INTEGER NULL
--       NULL = arv company-default. Eksisterende kunder forbliver NULL
--       → ingen adfærdsændring (falder til company-default = 14).
--   company_settings.default_payment_terms_days  INTEGER NOT NULL DEFAULT 14
--       Master/default. Singleton-rowen får 14 (= nuværende hardcodede frist).
--
-- SCOPE
--   - Kun additive kolonner. Ingen historiske rækker ændres.
--   - Ingen RPC-/funktionsændring (due_date beregnes fortsat som
--     today + p_due_days; TS-laget resolver kæden og sender p_due_days).
--   - Ingen backfill.
--
-- ROLLBACK
--   ALTER TABLE customers DROP COLUMN IF EXISTS payment_terms_days;
--   ALTER TABLE company_settings DROP COLUMN IF EXISTS default_payment_terms_days;
-- =====================================================================

BEGIN;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS payment_terms_days INTEGER;

COMMENT ON COLUMN customers.payment_terms_days IS
  'Betalingsfrist i dage (override). NULL = arv company_settings.default_payment_terms_days.';

ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS default_payment_terms_days INTEGER NOT NULL DEFAULT 14;

COMMENT ON COLUMN company_settings.default_payment_terms_days IS
  'Default betalingsfrist i dage (master). Bruges når customer.payment_terms_days er NULL.';

NOTIFY pgrst, 'reload schema';

COMMIT;
