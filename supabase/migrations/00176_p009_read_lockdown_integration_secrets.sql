-- =====================================================================
-- 00176 — P-009 laese-side A2: integrationshemmeligheder skjult for bruger-sessionen
--
-- Fund: integrations.api_key/api_secret/oauth_client_secret/oauth_access_token/oauth_refresh_token kunne LAESES af
-- enhver indlogget via REST (ALL-policy -> genskabt SELECT USING (true) i 00171). Vaerdierne er krypteret i appen
-- (integration-secrets.ts) og maskeres i UI, men ciphertext/evt. legacy-klartekst maa ikke kunne hentes. 0 raekker i prod
-- (forebyggende, samme klasse som 00161 R3 / 00164).
-- Kode (deployet FOER): alle integrations-forespoergsler i src/lib/actions/integrations.ts koerer med service-role inde i de
-- eksisterende gates (secretColumnReader); hemmeligheder returneres kun maskeret (has_*-flag). Webhook-ruten bruger
-- allerede service-role.
-- Rollback: GRANT SELECT ON public.integrations TO authenticated;
-- =====================================================================

BEGIN;

REVOKE SELECT ON public.integrations FROM authenticated;
GRANT SELECT (id, name, description, integration_type, is_active, base_url, auth_type, auth_header_name, oauth_token_url,
  oauth_client_id, oauth_expires_at, default_headers, timeout_ms, retry_count, field_mappings, last_sync_at, last_error,
  error_count, created_by, created_at, updated_at)
  ON public.integrations TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
