-- =====================================================================
-- 00175 — P-009 laese-side A1: portal-/partner-tokens skjult for bruger-sessionen, interne beskeder kun egne
--
-- Fund (prod read-only 2026-10-01):
--   * portal_access_tokens.token og partner_access_tokens.token kunne LAESES af enhver indlogget via REST (SELECT
--     USING (true)). Et portal-token giver fuld kundeadgang (se/underskriv tilbud); et partner-token partnerportal-adgang.
--     getPortalTokens/getPartnerTokens/checkCustomerPortalAccess returnerede desuden tokens til alle indloggede.
--   * messages: SELECT USING (true) -> alle kunne laese alle interne beskeder. Appen laeser kun egne (ind/udbakke).
-- Design:
--   * Kolonne-grants: authenticated kan laese alle kolonner UNDTAGEN token (raekker/status uaendret for UI).
--   * Kode (deployet FOER, expand/contract): gatede actions der bygger portal-links laeser tokenet med service-role
--     (src/lib/portal/token-reader.ts); token returneres kun til offers.send (portal) / settings.manage (partner);
--     INSERT returnerer ikke token fra DB. Uden session (anon-cron, P-003) er adfaerden uaendret.
--   * messages: SELECT kun afsender eller modtager.
--   * anon: partner_access_tokens mister anon-grants (ingen anon-kontekst laeser den); portal_access_tokens har
--     ingen anon-grants i prod (uaendret).
-- Rollback:
--   GRANT SELECT ON public.portal_access_tokens, public.partner_access_tokens TO authenticated;
--   DROP POLICY IF EXISTS messages_select_own ON public.messages;
--   CREATE POLICY "Users can view messages" ON public.messages FOR SELECT TO authenticated USING (true);
-- =====================================================================

BEGIN;

REVOKE SELECT ON public.portal_access_tokens FROM authenticated;
GRANT SELECT (id, customer_id, email, is_active, expires_at, last_accessed_at, created_by, created_at, _anon_policies_applied)
  ON public.portal_access_tokens TO authenticated;

REVOKE SELECT ON public.partner_access_tokens FROM authenticated;
GRANT SELECT (id, partner_customer_id, email, is_active, expires_at, last_accessed_at, created_by, created_at)
  ON public.partner_access_tokens TO authenticated;
REVOKE ALL ON public.partner_access_tokens FROM anon;

DROP POLICY IF EXISTS "Users can view messages" ON public.messages;
DROP POLICY IF EXISTS messages_select_own ON public.messages;
CREATE POLICY messages_select_own ON public.messages FOR SELECT TO authenticated
  USING (from_user_id = auth.uid() OR to_user_id = auth.uid());

NOTIFY pgrst, 'reload schema';

COMMIT;
