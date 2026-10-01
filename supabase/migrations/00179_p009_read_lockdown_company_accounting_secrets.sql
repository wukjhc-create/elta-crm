-- =====================================================================
-- 00179 — P-009 laese-side A4: virksomheds- og e-conomic-hemmeligheder skjult for bruger-sessionen
--
-- Fund (prod read-only 2026-10-01, scripts/prod-sensitive-columns.ts):
--   * company_settings.smtp_password / sms_gateway_api_key / sms_gateway_secret laesbare for alle indloggede;
--     getCompanySettings returnerede desuden HELE raekken (inkl. SMTP-password) til browseren for settings.view.
--   * accounting_integration_settings.api_token / agreement_grant_token: kolonne-grant ogsaa til anon (RLS-policy
--     begraenser raekker til admin/bogholderi). 0 vaerdier i prod (forebyggende).
-- Kode (deployet FOER): getCompanySettings/branding/opdatering bruger eksplicitte offentlige kolonner
-- (src/lib/settings/company-columns.ts); getSmtpSettings (settings.manage) og go-live-status (kun tilstedevaerelse) laeser
-- hemmeligheder med service-role; e-conomic-klient/health/alerts bruger allerede service-role.
-- bank_account/bank_reg_no er IKKE hemmelige (staar paa kundefakturaer).
-- Rollback:
--   GRANT SELECT ON public.company_settings TO authenticated;
--   GRANT SELECT ON public.accounting_integration_settings TO authenticated;
-- =====================================================================

BEGIN;

REVOKE SELECT ON public.company_settings FROM authenticated;
GRANT SELECT (id, company_name, company_address, company_city, company_postal_code, company_country, company_phone,
  company_email, company_vat_number, company_logo_url, company_website, smtp_host, smtp_port, smtp_user, smtp_from_email,
  smtp_from_name, default_tax_percentage, default_currency, default_offer_validity_days, default_terms_and_conditions,
  created_at, updated_at, sms_sender_name, sms_enabled, reminder_enabled, reminder_interval_days, reminder_max_count,
  reminder_email_subject, default_payment_terms_days, bank_reg_no, bank_account, time_cost_basis, time_cost_rate,
  invoice_email_config, payment_report_config, export_error_notification_config, company_logo_storage_path)
  ON public.company_settings TO authenticated;

REVOKE ALL ON public.accounting_integration_settings FROM anon;
REVOKE SELECT ON public.accounting_integration_settings FROM authenticated;
GRANT SELECT (id, provider, active, last_sync_at, config, created_at, updated_at)
  ON public.accounting_integration_settings TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
