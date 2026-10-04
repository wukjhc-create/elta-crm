/**
 * P-009 laese-side A4 (migration 00179): company_settings' hemmelige kolonner (smtp_password, sms_gateway_api_key,
 * sms_gateway_secret) er skjult for bruger-sessionen. Tidligere returnerede getCompanySettings HELE raekken — inkl.
 * SMTP-adgangskoden — til browseren for alle med settings.view. Bevidst IKKE 'use server'.
 * bank_account/bank_reg_no er IKKE hemmelige (staar paa kundefakturaer) og forbliver laesbare.
 */
export const COMPANY_SETTINGS_SECRET_COLUMNS = ['smtp_password', 'sms_gateway_api_key', 'sms_gateway_secret'] as const

export const COMPANY_SETTINGS_PUBLIC_COLUMNS = [
  'id', 'company_name', 'company_address', 'company_city', 'company_postal_code', 'company_country', 'company_phone',
  'company_email', 'company_vat_number', 'company_logo_url', 'company_website', 'smtp_host', 'smtp_port', 'smtp_user',
  'smtp_from_email', 'smtp_from_name', 'default_tax_percentage', 'default_currency', 'default_offer_validity_days',
  'default_terms_and_conditions', 'created_at', 'updated_at', 'sms_sender_name', 'sms_enabled', 'reminder_enabled',
  'reminder_interval_days', 'reminder_max_count', 'reminder_email_subject', 'default_payment_terms_days', 'bank_reg_no',
  'bank_account', 'time_cost_basis', 'time_cost_rate', 'invoice_email_config', 'payment_report_config',
  'export_error_notification_config', 'company_logo_storage_path',
].join(', ')

/**
 * Kundeportalen (sikkerhedsreview Q10, S1): portal-siderne sendte HELE rækken (select '*' via admin-klienten) som prop
 * til klientkomponenter → SMTP-adgangskode og SMS-nøgler lå i sidens RSC-data for enhver med et portallink. Kun det
 * portalen viser: firmaoplysninger + tilbudsstandarder. Ingen smtp_*, sms_*, bank-, timepris- eller *_config-felter.
 */
export const COMPANY_SETTINGS_PORTAL_COLUMNS = [
  'id', 'company_name', 'company_address', 'company_city', 'company_postal_code', 'company_country', 'company_phone',
  'company_email', 'company_vat_number', 'company_logo_url', 'company_website', 'default_tax_percentage',
  'default_currency', 'default_offer_validity_days', 'default_terms_and_conditions', 'created_at', 'updated_at',
].join(', ')
