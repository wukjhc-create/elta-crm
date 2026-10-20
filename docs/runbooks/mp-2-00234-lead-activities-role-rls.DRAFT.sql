-- =====================================================================================================================
-- UDKAST (IKKE ANVENDT) — MP-2 lead_activities: læse-/skriveadgang = appens rollemodel (Henrik 2026-10-20: Option A
-- godkendt i princippet). Endeligt filnavn tildeles ved godkendelse: supabase/migrations/00234_lead_activities_role_rls.sql
-- (første ledige nummer; tidligere udkasts-ID 00254 / LD-2 bevares kun som reference).
--
-- Rollemodel (src/lib/auth/permissions.ts:19-22): leads.view/create/edit = admin, serviceleder, salg.
-- Kode-skrivestier (npx tsx scripts/rls-write-sites.ts lead_activities): insert-roller = admin, salg, serviceleder;
--   alle bruger-session-inserts sætter performed_by = userId; lead-won/kontaktformular bruger service-role (uberørt).
-- Kode-læsning: kun getLeadActivities (src/lib/actions/leads.ts:577-591, gate leads.view).
-- Nu (staging + prod verificeret 2026-10-20: scripts/prod-table-policies.ts lead_activities; cli table-policies): SELECT "Users can view lead activities" USING (true) → montør og
--   bogholderi kan læse alle leadaktiviteter; INSERT lead_activities_insert_role inkl. montør.
-- =====================================================================================================================

-- ---------- PRE-CHECK (read-only; skal køres før og resultatet vises) ----------
-- 1) nuværende politikker (forventet: "Users can view lead activities" SELECT true + lead_activities_insert_role)
--    SELECT policyname, cmd, roles::text, qual, with_check FROM pg_policies WHERE schemaname='public' AND tablename='lead_activities';
-- 2) RLS slået til (forventet relrowsecurity = true)
--    SELECT relrowsecurity FROM pg_class WHERE oid = 'public.lead_activities'::regclass;
-- 3) user_role() findes og er SECURITY DEFINER/STABLE (bruges af andre politikker)
--    SELECT prosecdef, provolatile FROM pg_proc WHERE proname = 'user_role' AND pronamespace = 'public'::regnamespace;
-- 4) rækker uden performed_by (påvirker kun nye inserts — eksisterende rækker berøres ikke)
--    SELECT count(*) FILTER (WHERE performed_by IS NULL) uden_performer, count(*) i_alt FROM public.lead_activities;

BEGIN;

-- Læsning: kun roller med leads.view (admin, serviceleder, salg). Montør/bogholderi får ingen læseadgang.
DROP POLICY IF EXISTS "Users can view lead activities" ON public.lead_activities;
DROP POLICY IF EXISTS lead_activities_select_authenticated ON public.lead_activities;
DROP POLICY IF EXISTS lead_activities_select_role ON public.lead_activities;
CREATE POLICY lead_activities_select_role ON public.lead_activities FOR SELECT TO authenticated
  USING (public.user_role() IN ('admin', 'serviceleder', 'salg'));

-- Skrivning: kun leads.create/edit-roller, og kun som sig selv (append-only log; update/delete kun service-role som i dag)
DROP POLICY IF EXISTS lead_activities_insert_role ON public.lead_activities;
CREATE POLICY lead_activities_insert_role ON public.lead_activities FOR INSERT TO authenticated
  WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'salg') AND performed_by = auth.uid());

COMMIT;

-- ---------- POST-CHECK (read-only) ----------
-- a) præcis to politikker: lead_activities_select_role (SELECT) + lead_activities_insert_role (INSERT)
--    SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE schemaname='public' AND tablename='lead_activities' ORDER BY cmd;
-- b) rolleprøve (staging, harness role-probe): montør/bogholderi SELECT → 0 rækker; salg/serviceleder/admin → rækker;
--    montør INSERT → afvist; salg INSERT med performed_by = egen id → ok; med andens id → afvist
-- c) app: UI U192 (leads-tildeling/aktiviteter), U115, U122, U182 + scripts/rls/matrix-check (write-matrix opdateret:
--    lead_activities insert = admin, serviceleder, salg)

-- ---------- ROLLBACK (gendanner præcis den nuværende tilstand) ----------
-- BEGIN;
-- DROP POLICY IF EXISTS lead_activities_select_role ON public.lead_activities;
-- CREATE POLICY "Users can view lead activities" ON public.lead_activities FOR SELECT TO authenticated USING (true);
-- DROP POLICY IF EXISTS lead_activities_insert_role ON public.lead_activities;
-- CREATE POLICY lead_activities_insert_role ON public.lead_activities FOR INSERT TO authenticated
--   WITH CHECK (public.user_role() = ANY (ARRAY['admin','serviceleder','salg','montør']));
-- COMMIT;
-- NB: rollback genåbner læsning for alle authenticated (IKKE anon) — kræver særskilt vurdering før brug.
