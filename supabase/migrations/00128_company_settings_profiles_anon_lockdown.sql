-- =====================================================
-- 00128: Phase α.3 trin 1 — company_settings + profiles anon lockdown
--
-- Drop'er anon SELECT-policies + grants paa company_settings og profiles.
--
-- Kode-audit foer migration:
--   - company_settings: 2 anon-fetches i portal page-tree:
--       src/app/portal/[token]/page.tsx
--       src/app/portal/[token]/offers/[id]/page.tsx
--     Begge refactoret til createAdminClient (deployed FOER denne migration).
--   - profiles: ingen anon-bruger i portal-flow. Performer-joins i andre
--     filer (offer-activities.ts, calculations.ts, kalkia-calculations.ts,
--     export.ts) bruger getAuthenticatedClient — uberoert.
--   - portal_messages.sender_name lagres direkte; ingen profiles-JOIN i
--     getPortalMessages.
--
-- Idempotent. Ingen data-aendring.
-- =====================================================

BEGIN;

-- 1. company_settings: drop anon-policy + revoke grants
DROP POLICY IF EXISTS "Anon can view company settings" ON company_settings;
REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON company_settings FROM anon;

-- 2. profiles: drop anon-policy + revoke grants
DROP POLICY IF EXISTS "Anon can view basic profile info" ON profiles;
-- Note: profiles havde column-grants (id, full_name, email) fra 00060/00061.
-- REVOKE uden kolonne-spec fjerner ALLE grants paa rollen — også de
-- column-scopede. Bredt REVOKE er det rette her.
REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON profiles FROM anon;

COMMENT ON TABLE company_settings IS
  'Phase alpha.3 trin 1 (00128): anon-policy + grants fjernet. Portal page-tree fetcher singleton-row via createAdminClient.';

COMMENT ON TABLE profiles IS
  'Phase alpha.3 trin 1 (00128): anon-policy + grants fjernet. Ingen portal-anon-bruger eksisterer; ansatte tilgaar via authenticated-policies.';

NOTIFY pgrst, 'reload schema';

COMMIT;
