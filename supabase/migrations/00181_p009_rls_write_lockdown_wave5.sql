-- =====================================================================
-- 00181 — P-009 RLS-skrivelås, WAVE5 (work_orders)
--
-- GENERERET af scripts/rls/build-migration.ts fra scripts/rls/write-matrix.ts — ret matrixen, ikke denne fil.
--
-- Fund (P-009, S2 systemisk, prod read-only 2026-09-29): skrive-policies USING/WITH CHECK (true) -> enhver indlogget
-- kunne via REST oprette/rette/slette paa tvaers af roller (RBAC blev kun haandhaevet i server-actions).
-- Nu: praecis de roller appen skriver med via bruger-sessionen (AST-kortlagt: scripts/rls-write-sites.ts;
-- CI: npm run check:rls-matrix). Laesning (SELECT) er UAENDRET. anon mister alle tabel-grants.
-- service-role (cron, portal, sync) paavirkes ikke af RLS.
--
-- Rollback: genskab de droppede policies (navne i DROP-linjerne) som USING/WITH CHECK (true) for authenticated.
-- =====================================================================

BEGIN;

-- work_orders: work_orders.plan/edit/delete (admin, serviceleder); montør: start/afslut kun egne (GO-LIVE N11)
REVOKE ALL ON public.work_orders FROM anon;
DROP POLICY IF EXISTS "work_orders_all_auth" ON public.work_orders;
DROP POLICY IF EXISTS work_orders_insert_role ON public.work_orders;
DROP POLICY IF EXISTS work_orders_update_role ON public.work_orders;
DROP POLICY IF EXISTS work_orders_delete_role ON public.work_orders;
DROP POLICY IF EXISTS work_orders_select_authenticated ON public.work_orders;
CREATE POLICY work_orders_select_authenticated ON public.work_orders FOR SELECT TO authenticated USING (true);  -- laesning uaendret
CREATE POLICY work_orders_insert_role ON public.work_orders FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder'));
CREATE POLICY work_orders_update_role ON public.work_orders FOR UPDATE TO authenticated USING ((public.user_role() IN ('admin', 'serviceleder')) OR (public.user_role() IN ('montør') AND assigned_employee_id IN (SELECT e.id FROM public.employees e WHERE e.profile_id = auth.uid() AND e.active))) WITH CHECK ((public.user_role() IN ('admin', 'serviceleder')) OR (public.user_role() IN ('montør') AND status IN ('in_progress', 'done') AND assigned_employee_id IN (SELECT e.id FROM public.employees e WHERE e.profile_id = auth.uid() AND e.active)));
CREATE POLICY work_orders_delete_role ON public.work_orders FOR DELETE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder'));

NOTIFY pgrst, 'reload schema';

COMMIT;
