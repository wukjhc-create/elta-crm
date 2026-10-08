-- 00200 — Kost-lockdown bølge 2a (Henrik 2026-10-07: HIGH PRIORITY, staging først, ingen prod uden approval).
--
-- Problem (prod-verificeret, scripts/prod-cost-table-read-policies.ts): disse tabeller har SELECT-politik USING (true)
-- for authenticated → enhver indlogget medarbejder (også montør/salg) kan læse kostpriser, rabatter, avancer og
-- prisregler direkte via REST, uden om app-gates. Anon er allerede lukket (scripts/prod-anon-cost-exposure.ts).
--
-- Bølge 2a: tabeller som app-koden KUN læser som kost-rolle (read-site-analyse, scripts/rls/read-sites.ts) → SELECT
-- begrænses til admin/serviceleder/bogholderi (samme mønster som work_order_profit). Ingen kodeændring nødvendig;
-- service-role (crons/admin-klient) er upåvirket (bypasser RLS). Skrive-politikker og GRANTs er uændrede.
-- Bølge 2b (separat): product_catalog, customer_supplier_prices, calculations — læses også af salg → kolonne-niveau.
--
-- Rollback: DROP POLICY <tabel>_select_cost_roles og genskab `CREATE POLICY "<navn>" ON <tabel> FOR SELECT TO
-- authenticated USING (true)` for de politikker der droppes nedenfor.

BEGIN;

-- price_history
DROP POLICY IF EXISTS "Authenticated users can view price history" ON public.price_history;
CREATE POLICY price_history_select_cost_roles ON public.price_history FOR SELECT TO authenticated
  USING (public.user_role() IN ('admin', 'serviceleder', 'bogholderi'));

-- supplier_product_cache
DROP POLICY IF EXISTS "Authenticated users can view product cache" ON public.supplier_product_cache;
CREATE POLICY supplier_product_cache_select_cost_roles ON public.supplier_product_cache FOR SELECT TO authenticated
  USING (public.user_role() IN ('admin', 'serviceleder', 'bogholderi'));

-- customer_product_prices
DROP POLICY IF EXISTS "Authenticated users can view customer product prices" ON public.customer_product_prices;
CREATE POLICY customer_product_prices_select_cost_roles ON public.customer_product_prices FOR SELECT TO authenticated
  USING (public.user_role() IN ('admin', 'serviceleder', 'bogholderi'));

-- supplier_margin_rules
DROP POLICY IF EXISTS "Authenticated users can view margin rules" ON public.supplier_margin_rules;
CREATE POLICY supplier_margin_rules_select_cost_roles ON public.supplier_margin_rules FOR SELECT TO authenticated
  USING (public.user_role() IN ('admin', 'serviceleder', 'bogholderi'));

-- materials_catalog
DROP POLICY IF EXISTS materials_catalog_select ON public.materials_catalog;
DROP POLICY IF EXISTS materials_catalog_select_authenticated ON public.materials_catalog;
CREATE POLICY materials_catalog_select_cost_roles ON public.materials_catalog FOR SELECT TO authenticated
  USING (public.user_role() IN ('admin', 'serviceleder', 'bogholderi'));

-- material_price_history
DROP POLICY IF EXISTS material_price_history_select ON public.material_price_history;
CREATE POLICY material_price_history_select_cost_roles ON public.material_price_history FOR SELECT TO authenticated
  USING (public.user_role() IN ('admin', 'serviceleder', 'bogholderi'));

-- calc_components
DROP POLICY IF EXISTS "Authenticated users can read components" ON public.calc_components;
DROP POLICY IF EXISTS calc_components_select_authenticated ON public.calc_components;
CREATE POLICY calc_components_select_cost_roles ON public.calc_components FOR SELECT TO authenticated
  USING (public.user_role() IN ('admin', 'serviceleder', 'bogholderi'));

-- calc_component_materials
DROP POLICY IF EXISTS "Authenticated users can read component materials" ON public.calc_component_materials;
DROP POLICY IF EXISTS calc_component_materials_select_authenticated ON public.calc_component_materials;
CREATE POLICY calc_component_materials_select_cost_roles ON public.calc_component_materials FOR SELECT TO authenticated
  USING (public.user_role() IN ('admin', 'serviceleder', 'bogholderi'));

-- kalkia_nodes
DROP POLICY IF EXISTS "Authenticated users can read kalkia_nodes" ON public.kalkia_nodes;
DROP POLICY IF EXISTS kalkia_nodes_select_authenticated ON public.kalkia_nodes;
CREATE POLICY kalkia_nodes_select_cost_roles ON public.kalkia_nodes FOR SELECT TO authenticated
  USING (public.user_role() IN ('admin', 'serviceleder', 'bogholderi'));

-- kalkia_variant_materials
DROP POLICY IF EXISTS "Authenticated users can read kalkia_variant_materials" ON public.kalkia_variant_materials;
DROP POLICY IF EXISTS kalkia_variant_materials_select_authenticated ON public.kalkia_variant_materials;
CREATE POLICY kalkia_variant_materials_select_cost_roles ON public.kalkia_variant_materials FOR SELECT TO authenticated
  USING (public.user_role() IN ('admin', 'serviceleder', 'bogholderi'));

-- package_items
DROP POLICY IF EXISTS "Authenticated users can view package items" ON public.package_items;
CREATE POLICY package_items_select_cost_roles ON public.package_items FOR SELECT TO authenticated
  USING (public.user_role() IN ('admin', 'serviceleder', 'bogholderi'));

-- calculation_rows
DROP POLICY IF EXISTS "Users can view calculation rows" ON public.calculation_rows;
CREATE POLICY calculation_rows_select_cost_roles ON public.calculation_rows FOR SELECT TO authenticated
  USING (public.user_role() IN ('admin', 'serviceleder', 'bogholderi'));

-- kalkia_calculations
DROP POLICY IF EXISTS "Authenticated users can read kalkia_calculations" ON public.kalkia_calculations;
DROP POLICY IF EXISTS kalkia_calculations_select_authenticated ON public.kalkia_calculations;
CREATE POLICY kalkia_calculations_select_cost_roles ON public.kalkia_calculations FOR SELECT TO authenticated
  USING (public.user_role() IN ('admin', 'serviceleder', 'bogholderi'));

-- calibration_presets
DROP POLICY IF EXISTS calibration_presets_select ON public.calibration_presets;
CREATE POLICY calibration_presets_select_cost_roles ON public.calibration_presets FOR SELECT TO authenticated
  USING (public.user_role() IN ('admin', 'serviceleder', 'bogholderi'));

-- quick_jobs
DROP POLICY IF EXISTS quick_jobs_select ON public.quick_jobs;
CREATE POLICY quick_jobs_select_cost_roles ON public.quick_jobs FOR SELECT TO authenticated
  USING (public.user_role() IN ('admin', 'serviceleder', 'bogholderi'));

COMMIT;
