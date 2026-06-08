-- =====================================================
-- 00127: Phase α.2 trin 4 — customers + service_cases anon lockdown
--
-- Drop'er anon-policies paa customers + service_cases der var stillet op
-- til portal-flow via subquery paa portal_access_tokens. Disse policies
-- er allerede de facto broken siden trin 3 (00126), hvor anon mistede
-- SELECT-adgang til portal_access_tokens — subqueries returnerer 0 rows.
--
-- Refactor som er deployed FOER denne migration:
--   - getPortalServiceCases (service-cases.ts) — admin-client + customer_id-scope
--   - Andre portal-paths bruger allerede admin (validatePortalToken,
--     portalBookBesigtigelse, getPortalDocuments, getPortalMessages,
--     sendPortalMessage) eller authenticated (employee-facing)
--
-- Anon-policies droppet:
--   - customers "Anon can view customers with portal tokens" (subquery)
--   - customers "Anon can view customers linked to visible offers" (offers-subquery)
--   - service_cases "Anon can view service cases via portal" (subquery)
--
-- Anon-grants revoket fra customers + service_cases:
--   SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
--   (samme legacy GRANT ALL leftover som vi saa paa offer_activities
--    og portal_access_tokens; ingen aktiv anon-policy efter ovenstaaende
--    DROPs, saa grants paa papir uden tilsvarende RLS er stadig en svaghed)
--
-- INGEN data-aendring. INGEN authenticated-policies roeres. Idempotent.
-- =====================================================

BEGIN;

-- 1. customers: drop begge anon-SELECT-policies (begge er subquery-baserede)
DROP POLICY IF EXISTS "Anon can view customers with portal tokens" ON customers;
DROP POLICY IF EXISTS "Anon can view customers linked to visible offers" ON customers;

-- 2. service_cases: drop anon-SELECT-policy
DROP POLICY IF EXISTS "Anon can view service cases via portal" ON service_cases;

-- 3. Revoke alle anon-grants paa de to tabeller
REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON customers FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON service_cases FROM anon;

COMMENT ON TABLE customers IS
  'Phase alpha.2 trin 4 (00127): alle anon-policies + grants fjernet. Portal-flow tilgaar customers via createAdminClient efter validatePortalToken; ansatte tilgaar via authenticated-policies (uberoert).';

COMMENT ON TABLE service_cases IS
  'Phase alpha.2 trin 4 (00127): alle anon-policies + grants fjernet. Portal-flow (getPortalServiceCases) bruger nu createAdminClient + customer_id-scope. Ansatte tilgaar via authenticated-policies (uberoert).';

NOTIFY pgrst, 'reload schema';

COMMIT;
