-- =====================================================
-- Migration: 00148_export_error_notification_config.sql
-- Sprint Ø6.5 — Sikker mail-notifikation om e-conomic eksportfejl.
-- Date: 2026-06-15
--
-- Additiv, ikke-destruktiv: én nullable JSONB-kolonne på company_settings
-- (singleton) med konfiguration + dedup-tilstand for den daglige
-- eksportfejl-notifikation. NULL → notifikation slået FRA (ingen spam).
--
-- Form:
-- {
--   "enabled": false,
--   "recipients": ["bogholderi@eltasolar.dk"],
--   "min_hours_between": 20,            // anti-spam: min. timer mellem mails
--   "last_notified_at": null,           // dedup-tilstand (sat af cron)
--   "last_notified_count": null         // dedup-tilstand (sat af cron)
-- }
--
-- COST-FREE: kun modtager-emails + dedup-tællere. INGEN kost/margin/DB.
-- INGEN secrets (tokens ligger krypteret i accounting_integration_settings).
--
-- Rollback:
--   ALTER TABLE company_settings DROP COLUMN IF EXISTS export_error_notification_config;
-- =====================================================

ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS export_error_notification_config JSONB;

COMMENT ON COLUMN company_settings.export_error_notification_config IS
  'Sprint Ø6.5 — konfiguration + dedup-tilstand for daglig e-conomic eksportfejl-notifikation (enabled/recipients/min_hours_between/last_notified_at/last_notified_count). NULL = slået fra.';
