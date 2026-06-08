-- =====================================================
-- 00126: Phase α.2 trin 3 — portal_access_tokens anon SELECT/UPDATE lockdown
--
-- Drop'er anon SELECT- og UPDATE-policies paa portal_access_tokens, samt
-- alle resterende anon-grants paa tabellen. Forudsaetning: validatePortalToken
-- bruger allerede createAdminClient (deployed 82f432a, trin 1).
--
-- Refactor som er deployed FOER denne migration:
--   - validatePortalToken     (admin SELECT + UPDATE last_accessed_at)
--
-- Andre kode-paths der rammer portal_access_tokens (kontrolleret manuelt):
--   - portal.ts createPortalToken/getPortalTokens/deactivatePortalToken
--     → bruger getAuthenticatedClient (employees), uberoert af anon-revoke
--   - portal.ts sendEmployeeMessage (deep-link token-fetch)
--     → bruger getAuthenticatedClient, uberoert
--   - offers.ts:sendOffer (token-reuse + INSERT) → authenticated, uberoert
--   - email.ts, fuldmagt.ts, quote-actions.ts, customer-tasks.ts,
--     service-cases.ts, quote-generator.ts, portal-link.ts
--     → alle bruger getAuthenticatedClient eller cookie-baseret server-client,
--       uberoert af anon-revoke
--
-- INGEN data-aendring. Idempotent.
-- =====================================================

BEGIN;

-- 1. Drop anon SELECT-policy (fra 00009, gen-oprettet i 00061)
DROP POLICY IF EXISTS "Anyone can validate tokens" ON portal_access_tokens;

-- 2. Drop anon UPDATE-policy (fra 00060/00061)
DROP POLICY IF EXISTS "Anon can update portal token access time" ON portal_access_tokens;

-- 3. Revoke alle anon-grants (matcher 00061 + evt. bredere GRANT ALL leftovers)
REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON portal_access_tokens FROM anon;

COMMENT ON TABLE portal_access_tokens IS
  'Phase alpha.2 trin 3 (00126): anon SELECT/UPDATE policies + alle anon-grants fjernet. Token-validering sker via createAdminClient (service-role) i validatePortalToken efter server-side input-format-check.';

NOTIFY pgrst, 'reload schema';

COMMIT;
