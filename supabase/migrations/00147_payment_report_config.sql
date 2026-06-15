-- =====================================================
-- Migration: 00147_payment_report_config.sql
-- Sprint Ø5.0 — Planlagt betalingsrapport-mail til bogholderiet.
-- Date: 2026-06-15
--
-- Additiv, ikke-destruktiv: én nullable JSONB-kolonne på company_settings
-- (singleton) med konfiguration for den ugentlige betalingsrapport.
-- NULL → rapporten er slået FRA (ingen spam som default).
--
-- Form:
-- {
--   "enabled": false,
--   "recipients": ["bogholderi@eltasolar.dk"],
--   "filter": "both",          // overdue | outstanding | both
--   "skip_if_empty": true
-- }
--
-- COST-FREE: konfigurationen indeholder kun modtager-emails + filtervalg.
-- INGEN kost/margin/DB/medarbejderkost.
--
-- Rollback:
--   ALTER TABLE company_settings DROP COLUMN IF EXISTS payment_report_config;
-- =====================================================

ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS payment_report_config JSONB;

COMMENT ON COLUMN company_settings.payment_report_config IS
  'Sprint Ø5.0 — konfiguration for planlagt betalingsrapport-mail (enabled/recipients/filter/skip_if_empty). NULL = slået fra.';
