-- =====================================================
-- Migration 00223: calculation_settings — indkøbsavancer kun læsbare for roller med kostadgang (GP-1)
--
-- STATUS: UDKAST — BLOCKED_APPROVAL (Henrik). Branch calc-settings-rls-00223. App-delen er allerede i prod
--         (e5d8d34d: server actions udleverer ikke avancerne til salg/montør).
--
-- Baggrund (grossist-review 2026-10-14, GP-1): produktsøgningen viser salg en estimeret salgspris = kost × (1 + global
-- avance). Avancen (margin_materials/margin_products/margin_subcontractor) kunne læses af alle indloggede direkte via REST
-- (to SELECT-politikker med USING (true): 00018 og 00178) → nettoindkøbsprisen kan regnes baglæns.
--
-- Ændring: de to SELECT-politikker erstattes af én: alle rækker undtagen de tre avance-nøgler for alle indloggede;
-- avance-nøglerne kun for admin/serviceleder/bogholderi (= offers.view.cost_prices). Skrivepolitikker uændrede.
-- Server-kode læser avancen med admin-klienten (lib/settings/product-margin.ts) og påvirkes ikke.
--
-- Data: ingen rækker ændres.
-- Pre/post (read-only): scripts/prod-table-select-policies.ts calculation_settings (før: 2 politikker USING true;
--           efter: 1 politik med nøgle-/rollebetingelse)
-- Rollback: DROP POLICY calculation_settings_select_scoped; CREATE POLICY calculation_settings_select_authenticated
--           ... FOR SELECT TO authenticated USING (true);
-- =====================================================

BEGIN;

DROP POLICY IF EXISTS "Authenticated users can view calculation settings" ON public.calculation_settings;
DROP POLICY IF EXISTS calculation_settings_select_authenticated ON public.calculation_settings;
DROP POLICY IF EXISTS calculation_settings_select_scoped ON public.calculation_settings;

CREATE POLICY calculation_settings_select_scoped ON public.calculation_settings
  FOR SELECT TO authenticated
  USING (
    setting_key NOT IN ('margin_materials', 'margin_products', 'margin_subcontractor')
    OR public.user_role() IN ('admin', 'serviceleder', 'bogholderi')
  );

COMMIT;
