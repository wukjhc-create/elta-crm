-- =====================================================
-- 00124: Phase α.2 trin 2 — offer_activities anon INSERT lockdown
--
-- Drop'er anon INSERT-policyen paa offer_activities. Portal-flow
-- (acceptOffer, rejectOffer, getPortalOffer view-tracking) bruger nu
-- createAdminClient (service-role) efter app-layer customer_id-tjek
-- på offers-rowen — samme moenster som Phase α.1 / 00122.
--
-- Refactored kaldesteder der allerede er deployed FOER denne migration:
--   - getPortalOffer    (view activity)
--   - acceptOffer       (accepted + project_created + service_case_created)
--   - rejectOffer       (rejected)
--
-- Anon kan stadig SELECT offer_activities hvis nogen anden policy
-- tillader det (typisk ingen — historik vises kun til authenticated
-- staff). INGEN NYE POLICIES tilfoejes her.
--
-- Idempotent:
--   - DROP POLICY IF EXISTS
--   - REVOKE er idempotent
--   - INGEN data-aendring, INGEN tabel-aendring
-- =====================================================

BEGIN;

-- 1. Drop anon INSERT-policy (oprettet i 00061)
DROP POLICY IF EXISTS "Anon can log portal activities" ON offer_activities;

-- 2. Revoke INSERT-grant fra anon (matcher 00061 grant)
REVOKE INSERT ON offer_activities FROM anon;

COMMENT ON TABLE offer_activities IS
  'Phase alpha.2 trin 2 (00124): anon INSERT-policy + grant fjernet. Portal-flow (acceptOffer, rejectOffer, getPortalOffer view-tracking) bruger nu createAdminClient server-side, scoped via app-layer customer_id-tjek paa offers-rowen.';

NOTIFY pgrst, 'reload schema';

COMMIT;
