-- =====================================================================
-- 00164 — supplier_settings: hemmelige kolonner + admin-only skrivning (incident P-005, S3)
--
-- Fund (P3 #17, prod read-only 2026-09-28):
--   * api_credentials/ftp_credentials (jsonb, kan rumme klartekst-credentials) kunne LAESES af enhver indlogget
--     (tabel-SELECT + policy USING (true)). I prod er de tomme (0 raekker) — lukkes FOREBYGGENDE (klasse som R3/00161).
--     credential_encrypted er et boolean-flag og ikke hemmeligt.
--   * Enhver indlogget kunne INSERT/UPDATE/DELETE leverandoerindstillinger (standardmargin, sync-konfiguration).
--   * anon havde tabel-grants (RLS stoppede raekkerne, men grants skal vaek).
-- Kode (skal vaere deployet FOER denne migration, expand/contract): brugerklienten vaelger kun
-- SUPPLIER_SETTINGS_PUBLIC_COLUMNS (src/lib/services/supplier-settings-columns.ts); server actions er gatet med
-- settings.suppliers. Service-role (cron/sync) paavirkes ikke.
--
-- Rollback:
--   GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_settings TO authenticated;
--   DROP POLICY IF EXISTS supplier_settings_insert_admin ON public.supplier_settings; (samme for update/delete)
--   CREATE POLICY "Authenticated users can create supplier settings" ON public.supplier_settings FOR INSERT TO authenticated WITH CHECK (true);
--   CREATE POLICY "Authenticated users can update supplier settings" ON public.supplier_settings FOR UPDATE TO authenticated USING (true);
--   CREATE POLICY "Authenticated users can delete supplier settings" ON public.supplier_settings FOR DELETE TO authenticated USING (true);
-- =====================================================================

BEGIN;

-- 1. Ingen anon-adgang overhovedet
REVOKE ALL ON public.supplier_settings FROM anon;

-- 2. Kolonne-grants for authenticated: kun ikke-hemmelige kolonner (samme moenster som 00161 R3)
REVOKE SELECT, INSERT, UPDATE ON public.supplier_settings FROM authenticated;
GRANT SELECT (id, supplier_id, import_format, csv_delimiter, csv_encoding, column_mappings, api_base_url, ftp_host,
  default_margin_percentage, auto_update_prices, is_preferred, last_import_at, created_at, updated_at,
  adapter_code, adapter_version, sync_config, credential_encrypted) ON public.supplier_settings TO authenticated;
GRANT INSERT (supplier_id, import_format, csv_delimiter, csv_encoding, column_mappings, api_base_url, ftp_host,
  default_margin_percentage, auto_update_prices, is_preferred, last_import_at, adapter_code, adapter_version, sync_config, credential_encrypted)
  ON public.supplier_settings TO authenticated;
GRANT UPDATE (import_format, csv_delimiter, csv_encoding, column_mappings, api_base_url, ftp_host,
  default_margin_percentage, auto_update_prices, is_preferred, last_import_at, adapter_code, adapter_version, sync_config, updated_at, credential_encrypted)
  ON public.supplier_settings TO authenticated;

-- 3. Skrivning kun for admin (= app-permission settings.suppliers); laesning uaendret for indloggede
DROP POLICY IF EXISTS "Authenticated users can create supplier settings" ON public.supplier_settings;
DROP POLICY IF EXISTS "Authenticated users can update supplier settings" ON public.supplier_settings;
DROP POLICY IF EXISTS "Authenticated users can delete supplier settings" ON public.supplier_settings;
DROP POLICY IF EXISTS supplier_settings_insert_admin ON public.supplier_settings;
DROP POLICY IF EXISTS supplier_settings_update_admin ON public.supplier_settings;
DROP POLICY IF EXISTS supplier_settings_delete_admin ON public.supplier_settings;
CREATE POLICY supplier_settings_insert_admin ON public.supplier_settings FOR INSERT TO authenticated WITH CHECK (public.user_role() = 'admin');
CREATE POLICY supplier_settings_update_admin ON public.supplier_settings FOR UPDATE TO authenticated
  USING (public.user_role() = 'admin') WITH CHECK (public.user_role() = 'admin');
CREATE POLICY supplier_settings_delete_admin ON public.supplier_settings FOR DELETE TO authenticated USING (public.user_role() = 'admin');

NOTIFY pgrst, 'reload schema';

COMMIT;
