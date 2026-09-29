-- =====================================================================
-- 00168 — suppliers: admin-only skrivning + ingen anon-grants (incident P-008, S2)
--
-- Fund (prod read-only 2026-09-29, scripts/prod-precheck-00167.ts):
--   * Policies "Authenticated users can create/update/delete suppliers" = USING/WITH CHECK (true): ENHVER indlogget
--     (fx montoer) kan via REST slette AO/LM. suppliers(id) har ON DELETE CASCADE til supplier_products (~310k
--     priser), supplier_settings, credentials, sync-jobs/-logs, margin-regler m.m. -> et enkelt DELETE sletter hele
--     leverandoer-domaenet.
--   * anon har alle tabel-grants (RLS stopper raekkerne, men grants skal vaek — samme klasse som 00162/00164).
-- Kode: ALLE app-skrivninger til suppliers er gatet med settings.suppliers (= kun admin) i suppliers.ts og
-- products.ts; setup-lemu og sync bruger service-role (paavirkes ikke). Ingen kodeaendring noedvendig.
-- Laesning er uaendret (alle indloggede — bruges bredt i kalkulation/tilbud).
--
-- Rollback:
--   DROP POLICY IF EXISTS suppliers_insert_admin ON public.suppliers; (samme for update/delete)
--   CREATE POLICY "Authenticated users can create suppliers" ON public.suppliers FOR INSERT TO authenticated WITH CHECK (true);
--   CREATE POLICY "Authenticated users can update suppliers" ON public.suppliers FOR UPDATE TO authenticated USING (true);
--   CREATE POLICY "Authenticated users can delete suppliers" ON public.suppliers FOR DELETE TO authenticated USING (true);
--   GRANT ALL ON public.suppliers TO anon;
-- =====================================================================

BEGIN;

REVOKE ALL ON public.suppliers FROM anon;

DROP POLICY IF EXISTS "Authenticated users can create suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Authenticated users can update suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Authenticated users can delete suppliers" ON public.suppliers;
DROP POLICY IF EXISTS suppliers_insert_admin ON public.suppliers;
DROP POLICY IF EXISTS suppliers_update_admin ON public.suppliers;
DROP POLICY IF EXISTS suppliers_delete_admin ON public.suppliers;
CREATE POLICY suppliers_insert_admin ON public.suppliers FOR INSERT TO authenticated WITH CHECK (public.user_role() = 'admin');
CREATE POLICY suppliers_update_admin ON public.suppliers FOR UPDATE TO authenticated
  USING (public.user_role() = 'admin') WITH CHECK (public.user_role() = 'admin');
CREATE POLICY suppliers_delete_admin ON public.suppliers FOR DELETE TO authenticated USING (public.user_role() = 'admin');

NOTIFY pgrst, 'reload schema';

COMMIT;
