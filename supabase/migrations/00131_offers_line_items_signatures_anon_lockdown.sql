-- =====================================================
-- 00131: Phase α.3 trin 4+5 — offers + offer_line_items + offer_signatures
-- anon lockdown
--
-- Den endelige lukning af anon-adgang til tilbudsflowet. Drop'er 5
-- anon-policies og revoker alle anon-grants paa de tre tabeller.
-- Authenticated employee + service-role policies bevares.
--
-- Sikkerhedshuller der lukkes:
--   1. offer_signatures "Anyone can create signatures" (qual=true) —
--      anon kunne underskrive ENHVER offer_id (gaette-attack)
--   2. offers "Anon can update sent/viewed offers" (kun status-scope,
--      ingen customer_id, ingen kolonne-scope) — anon kunne UPDATE
--      ethvert sent/viewed offer
--   3. offers/line_items/signatures SELECT-policies returnerede alle
--      sent/viewed/accepted/rejected offers paa tvaers af kunder
--
-- Refactored kode (deployed FOER denne migration):
--   - portal.ts getPortalOffers     → admin + customer_id-scope
--   - portal.ts getPortalOffer      → admin + customer_id-scope
--   - portal.ts acceptOffer         → admin + customer_id-scope paa SELECT/UPDATE
--   - portal.ts rejectOffer         → admin + customer_id-scope paa SELECT/UPDATE
--   - api/portal/offers/pdf/route   → validatePortalToken + admin
--   - view-offer/[id]/page          → admin
--
-- Idempotent. Ingen data-aendring.
-- =====================================================

BEGIN;

-- offers: drop anon-policies
DROP POLICY IF EXISTS "Anon can view sent/viewed/accepted/rejected offers" ON offers;
DROP POLICY IF EXISTS "Anon can update sent/viewed offers" ON offers;

-- offer_line_items: drop anon-policy
DROP POLICY IF EXISTS "Anon can view offer line items" ON offer_line_items;

-- offer_signatures: drop begge anon-policies (SELECT + INSERT)
DROP POLICY IF EXISTS "Anon can view offer signatures" ON offer_signatures;
DROP POLICY IF EXISTS "Anyone can create signatures" ON offer_signatures;

-- Revoke alle anon-grants paa de tre tabeller
REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON offers FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON offer_line_items FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON offer_signatures FROM anon;

COMMENT ON TABLE offers IS
  'Phase alpha.3 trin 4+5 (00131): alle anon-policies + grants fjernet. Portal-flow (getPortalOffers/Offer, acceptOffer, rejectOffer, PDF, legacy /view-offer) bruger admin-client efter validatePortalToken + eksplicit customer_id-scope.';

COMMENT ON TABLE offer_line_items IS
  'Phase alpha.3 trin 4+5 (00131): anon SELECT-policy + grants fjernet. Portal henter via admin scoped paa offer_id (som igen er kunde-verificeret).';

COMMENT ON TABLE offer_signatures IS
  'Phase alpha.3 trin 4+5 (00131): anon SELECT + INSERT policies + grants fjernet. acceptOffer INSERTer via admin efter offer.customer_id-verifikation. Det tidligere "Anyone can create signatures" (qual=true) gjorde det muligt for anon at underskrive ethvert offer_id.';

NOTIFY pgrst, 'reload schema';

COMMIT;
