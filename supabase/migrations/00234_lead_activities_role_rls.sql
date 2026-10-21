-- =====================================================================================================================
-- 00234 — lead_activities: læseadgang = appens leads.view-model (MP-2a; tidl. udkasts-ID 00254 / LD-2)
-- Godkendt af Henrik i chat 2026-10-21: "lead_activities SELECT/RLS only … admin, serviceleder, salg … not bogholderi,
-- montør … no data mutation, no INSERT/business-rule change, no unrelated policy changes".
--
-- Før (staging + prod, verificeret 2026-10-21): SELECT "Users can view lead activities" USING (true) → alle authenticated
-- (også montør og bogholderi) kunne læse alle leadaktiviteter.
-- Efter: SELECT kun for user_role() i (admin, serviceleder, salg) = permissions.ts leads.view.
-- Eneste bruger-session-læser i koden: getLeadActivities (src/lib/actions/leads.ts, gate leads.view). Ingen views eller
-- public-funktioner refererer tabellen (scripts/prod-table-dependents.ts + cli table-dependents).
-- INSERT-politikken (lead_activities_insert_role), grants og data røres IKKE.
-- =====================================================================================================================

BEGIN;

DROP POLICY IF EXISTS "Users can view lead activities" ON public.lead_activities;
DROP POLICY IF EXISTS lead_activities_select_authenticated ON public.lead_activities;
DROP POLICY IF EXISTS lead_activities_select_role ON public.lead_activities;

CREATE POLICY lead_activities_select_role ON public.lead_activities
  FOR SELECT TO authenticated
  USING (public.user_role() IN ('admin', 'serviceleder', 'salg'));

COMMIT;

-- ROLLBACK (gendanner præcis tilstanden før 00234; genåbner læsning for alle authenticated — IKKE anon — kræver særskilt
-- vurdering før brug):
--   BEGIN;
--   DROP POLICY IF EXISTS lead_activities_select_role ON public.lead_activities;
--   CREATE POLICY "Users can view lead activities" ON public.lead_activities FOR SELECT TO authenticated USING (true);
--   COMMIT;
