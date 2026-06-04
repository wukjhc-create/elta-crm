-- =====================================================
-- 00122: Phase α.1 — portal anon RLS lockdown (first batch)
--
-- Fjerner 4 af de mest kritiske wildcard anon-policies fra portal-
-- flowet. Disse policies tillod direkte anon-laesning/skrivning til
-- tabeller med kundedata uden token-baseret scope-check.
--
-- Portal runtime er forinden migreret til at bruge createAdminClient()
-- (service-role) efter server-side token-validering via
-- validatePortalToken — samme moenster som Phase B1's
-- document_confirmations (migration 00120).
--
-- Refactored server actions der allerede er deployed FOER denne migration:
--   - getPortalMessages       (portal_messages SELECT via admin)
--   - sendPortalMessage       (portal_messages INSERT via admin)
--   - getPortalDocuments      (customer_documents SELECT via admin)
--   - portalBookBesigtigelse  (customer_tasks INSERT via admin)
--
-- INGEN NYE POLICIES tilfoejes — anon mister komplet adgang til
-- de beroerte tabeller. Authenticated-policies bevares uaendret.
--
-- BEVARES I PHASE α.1 (out of scope — kommer i Phase α.2):
--   - portal_access_tokens "Anyone can validate tokens" (anon SELECT)
--   - portal_access_tokens "Anon can update portal token access time" (anon UPDATE)
--   - offer_activities "Anon can log portal activities" (anon INSERT)
--   - customers "Anon can view customers with portal tokens" (subquery-policy)
--   - service_cases "Anon can view service cases via portal" (subquery)
--   - offers/offer_line_items (status-scoped, OK)
--
-- IDEMPOTENT:
--   - DROP POLICY IF EXISTS for alle 4 policies
--   - INGEN UPDATE, INGEN DELETE paa data
--   - INGEN tabelaendring, INGEN ny policy
-- =====================================================

BEGIN;

-- 1. customer_tasks: drop FOR ALL anon wildcard (migration 00064)
DROP POLICY IF EXISTS "Anon portal access customer tasks" ON customer_tasks;

-- 2-3. portal_messages: drop SELECT + INSERT anon wildcards (migration 00009/00061)
DROP POLICY IF EXISTS "Portal users can view their messages" ON portal_messages;
DROP POLICY IF EXISTS "Portal users can create messages" ON portal_messages;

-- 4. customer_documents: drop SELECT anon wildcard (migration 00061)
DROP POLICY IF EXISTS "Anon can view customer documents" ON customer_documents;

-- Selv-dokumenterende kommentarer
COMMENT ON TABLE customer_tasks IS
  'Phase alpha.1 (00122): anon FOR ALL wildcard fjernet. Portal-flow (portalBookBesigtigelse) bruger nu createAdminClient server-side, scoped til session.customer_id via valideret token.';

COMMENT ON TABLE portal_messages IS
  'Phase alpha.1 (00122): anon SELECT/INSERT wildcards fjernet. Portal-flow (getPortalMessages, sendPortalMessage) bruger nu createAdminClient server-side, scoped til session.customer_id.';

COMMENT ON COLUMN customer_documents.description IS
  'Phase 9I + alpha.1 (00122): anon SELECT-wildcard fjernet. Portal getPortalDocuments bruger nu createAdminClient + getSafeDocumentDescription for at curate description-feltet foer det rammer kunde-portal.';

NOTIFY pgrst, 'reload schema';

COMMIT;
