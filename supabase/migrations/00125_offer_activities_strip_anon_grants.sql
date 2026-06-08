-- =====================================================
-- 00125: Phase α.2.5 — strip alle resterende anon-grants paa offer_activities
--
-- Verifikation efter 00124 viste at anon stadig havde:
--   SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
-- paa offer_activities. INSERT blev allerede revoket i 00124.
--
-- Disse grants kommer sandsynligvis fra en bred GRANT ALL ON ... TO anon
-- et eller andet sted i historikken. Da RLS-policies for anon ikke
-- tillader nogen af operationerne (ingen anon SELECT/UPDATE/DELETE-policy
-- findes paa offer_activities), er effekten i praksis: ingen reel adgang.
-- Men grants paa papir er stadig en svaghed.
--
-- Code audit (foer migration): ingen anon-client laeser eller skriver
-- offer_activities i src/. Portal-flow gaar via admin (post-00124).
-- Authenticated dashboard (offer-activities.ts:getOfferActivities,
-- kalkia-calculations.ts) bruger getAuthenticatedClient -> 'authenticated'
-- role, uberoert af denne migration.
--
-- INGEN data-aendring. INGEN tabel-aendring. Idempotent.
-- =====================================================

BEGIN;

REVOKE SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON offer_activities FROM anon;

COMMENT ON TABLE offer_activities IS
  'Phase alpha.2.5 (00125): alle anon-grants (SELECT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER) fjernet. INSERT blev fjernet i 00124. offer_activities er nu service-role/authenticated-only.';

NOTIFY pgrst, 'reload schema';

COMMIT;
