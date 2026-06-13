-- Sprint Ø3.7 — Redigerbare faktura-/rykkertekster + afsenderidentitet.
--
-- Additiv, ikke-destruktiv: én nullable JSONB-kolonne på company_settings
-- (singleton). NULL → koden falder tilbage til de eksisterende
-- standard-templates (DEFAULT_INVOICE_EMAIL_CONFIG i koden), så faktura-
-- og rykkermails ALDRIG kan blive usendbare pga. tom template.
--
-- Form (alle felter valgfri; tomme felter → fallback til kodestandard):
-- {
--   "sender_name": "Elta Solar – Bogholderi",
--   "reply_to": "kontakt@eltasolar.dk",
--   "invoice":   { "subject": "...", "body": "..." },
--   "reminder1": { "subject": "...", "body": "..." },
--   "reminder2": { "subject": "...", "body": "..." },
--   "reminder3": { "subject": "...", "body": "..." }
-- }
--
-- Rollback: ALTER TABLE company_settings DROP COLUMN IF EXISTS invoice_email_config;

ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS invoice_email_config JSONB;

COMMENT ON COLUMN company_settings.invoice_email_config IS
  'Sprint Ø3.7 — redigerbare faktura-/rykkertekster + afsender. NULL = brug kodestandard-template.';
