/**
 * Offentlige kolonner i supplier_settings (P-005). Bevidst IKKE 'use server'.
 *
 * `api_credentials` og `ftp_credentials` (jsonb) kan rumme klartekst-credentials (legacy; credentials ligger i dag
 * krypteret i supplier_credentials) og maa aldrig vaelges af brugerklienten. `credential_encrypted` er et boolean-flag. Migration 00164 fjerner SELECT paa dem for
 * authenticated/anon — derfor maa koden ALDRIG bruge select('*') eller .select() mod tabellen.
 */
export const SUPPLIER_SETTINGS_PUBLIC_COLUMNS =
  'id, supplier_id, import_format, csv_delimiter, csv_encoding, column_mappings, api_base_url, ftp_host, default_margin_percentage, auto_update_prices, is_preferred, last_import_at, created_at, updated_at, adapter_code, adapter_version, sync_config, credential_encrypted'

export const SUPPLIER_SETTINGS_SECRET_COLUMNS = ['api_credentials', 'ftp_credentials'] as const
