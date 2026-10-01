-- =====================================================================
-- 00178 — P-009 RLS-skrivelås, WAVE4 (auto_calculations, auto_offer_texts, calc_component_categories, calc_component_labor_rules, calc_component_materials, calc_component_variant_materials, calc_component_variants, calc_components, calculation_feedback, calculation_rows, calculation_settings, calculation_snapshots, calculations, calculator_templates, calibration_presets, kalkia_building_profiles, kalkia_calculation_rows, kalkia_calculations, kalkia_global_factors, kalkia_nodes, kalkia_rules, kalkia_variant_materials, kalkia_variants, material_price_history, materials, materials_catalog, package_categories, package_items, package_options, packages, price_explanations, product_catalog, product_categories, project_contexts, project_interpretations, project_keywords, project_risks, project_templates, risk_assessments, risk_detection_rules, room_templates, room_types, sales_text_blocks, solar_products)
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

-- auto_calculations: AST-afledt
-- anon-grants BEVARES midlertidigt: anon-cron (P-003, rettelse afventer Henrik) — revoke ville skifte tom laesning til fejl (RLS blokerer stadig al anon-skrivning — ingen anon-policies)
DROP POLICY IF EXISTS "Users can manage calculations" ON public.auto_calculations;
DROP POLICY IF EXISTS auto_calculations_insert_role ON public.auto_calculations;
DROP POLICY IF EXISTS auto_calculations_update_role ON public.auto_calculations;
DROP POLICY IF EXISTS auto_calculations_delete_role ON public.auto_calculations;
DROP POLICY IF EXISTS auto_calculations_select_authenticated ON public.auto_calculations;
CREATE POLICY auto_calculations_select_authenticated ON public.auto_calculations FOR SELECT TO authenticated USING (true);  -- laesning uaendret
CREATE POLICY auto_calculations_insert_role ON public.auto_calculations FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder'));

-- auto_offer_texts: AST-afledt
REVOKE ALL ON public.auto_offer_texts FROM anon;
DROP POLICY IF EXISTS "Users can manage offer texts" ON public.auto_offer_texts;
DROP POLICY IF EXISTS auto_offer_texts_insert_role ON public.auto_offer_texts;
DROP POLICY IF EXISTS auto_offer_texts_update_role ON public.auto_offer_texts;
DROP POLICY IF EXISTS auto_offer_texts_delete_role ON public.auto_offer_texts;
DROP POLICY IF EXISTS auto_offer_texts_select_authenticated ON public.auto_offer_texts;
CREATE POLICY auto_offer_texts_select_authenticated ON public.auto_offer_texts FOR SELECT TO authenticated USING (true);  -- laesning uaendret
CREATE POLICY auto_offer_texts_insert_role ON public.auto_offer_texts FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder'));

-- calc_component_categories: AST-afledt
REVOKE ALL ON public.calc_component_categories FROM anon;
DROP POLICY IF EXISTS "Authenticated users can manage component categories" ON public.calc_component_categories;
DROP POLICY IF EXISTS calc_component_categories_insert_role ON public.calc_component_categories;
DROP POLICY IF EXISTS calc_component_categories_update_role ON public.calc_component_categories;
DROP POLICY IF EXISTS calc_component_categories_delete_role ON public.calc_component_categories;
DROP POLICY IF EXISTS calc_component_categories_select_authenticated ON public.calc_component_categories;
CREATE POLICY calc_component_categories_select_authenticated ON public.calc_component_categories FOR SELECT TO authenticated USING (true);  -- laesning uaendret

-- calc_component_labor_rules: AST-afledt
REVOKE ALL ON public.calc_component_labor_rules FROM anon;
DROP POLICY IF EXISTS "Authenticated users can manage labor rules" ON public.calc_component_labor_rules;
DROP POLICY IF EXISTS calc_component_labor_rules_insert_role ON public.calc_component_labor_rules;
DROP POLICY IF EXISTS calc_component_labor_rules_update_role ON public.calc_component_labor_rules;
DROP POLICY IF EXISTS calc_component_labor_rules_delete_role ON public.calc_component_labor_rules;
DROP POLICY IF EXISTS calc_component_labor_rules_select_authenticated ON public.calc_component_labor_rules;
CREATE POLICY calc_component_labor_rules_select_authenticated ON public.calc_component_labor_rules FOR SELECT TO authenticated USING (true);  -- laesning uaendret

-- calc_component_materials: AST-afledt
REVOKE ALL ON public.calc_component_materials FROM anon;
DROP POLICY IF EXISTS "Authenticated users can manage component materials" ON public.calc_component_materials;
DROP POLICY IF EXISTS calc_component_materials_insert_role ON public.calc_component_materials;
DROP POLICY IF EXISTS calc_component_materials_update_role ON public.calc_component_materials;
DROP POLICY IF EXISTS calc_component_materials_delete_role ON public.calc_component_materials;
DROP POLICY IF EXISTS calc_component_materials_select_authenticated ON public.calc_component_materials;
CREATE POLICY calc_component_materials_select_authenticated ON public.calc_component_materials FOR SELECT TO authenticated USING (true);  -- laesning uaendret
CREATE POLICY calc_component_materials_insert_role ON public.calc_component_materials FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder'));
CREATE POLICY calc_component_materials_update_role ON public.calc_component_materials FOR UPDATE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder')) WITH CHECK (public.user_role() IN ('admin', 'serviceleder'));
CREATE POLICY calc_component_materials_delete_role ON public.calc_component_materials FOR DELETE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder'));

-- calc_component_variant_materials: AST-afledt
REVOKE ALL ON public.calc_component_variant_materials FROM anon;
DROP POLICY IF EXISTS "Authenticated users can manage variant materials" ON public.calc_component_variant_materials;
DROP POLICY IF EXISTS calc_component_variant_materials_insert_role ON public.calc_component_variant_materials;
DROP POLICY IF EXISTS calc_component_variant_materials_update_role ON public.calc_component_variant_materials;
DROP POLICY IF EXISTS calc_component_variant_materials_delete_role ON public.calc_component_variant_materials;
DROP POLICY IF EXISTS calc_component_variant_materials_select_authenticated ON public.calc_component_variant_materials;
CREATE POLICY calc_component_variant_materials_select_authenticated ON public.calc_component_variant_materials FOR SELECT TO authenticated USING (true);  -- laesning uaendret
CREATE POLICY calc_component_variant_materials_insert_role ON public.calc_component_variant_materials FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder'));
CREATE POLICY calc_component_variant_materials_delete_role ON public.calc_component_variant_materials FOR DELETE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder'));

-- calc_component_variants: AST-afledt
REVOKE ALL ON public.calc_component_variants FROM anon;
DROP POLICY IF EXISTS "Authenticated users can manage component variants" ON public.calc_component_variants;
DROP POLICY IF EXISTS calc_component_variants_insert_role ON public.calc_component_variants;
DROP POLICY IF EXISTS calc_component_variants_update_role ON public.calc_component_variants;
DROP POLICY IF EXISTS calc_component_variants_delete_role ON public.calc_component_variants;
DROP POLICY IF EXISTS calc_component_variants_select_authenticated ON public.calc_component_variants;
CREATE POLICY calc_component_variants_select_authenticated ON public.calc_component_variants FOR SELECT TO authenticated USING (true);  -- laesning uaendret
CREATE POLICY calc_component_variants_insert_role ON public.calc_component_variants FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder'));
CREATE POLICY calc_component_variants_update_role ON public.calc_component_variants FOR UPDATE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder')) WITH CHECK (public.user_role() IN ('admin', 'serviceleder'));
CREATE POLICY calc_component_variants_delete_role ON public.calc_component_variants FOR DELETE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder'));

-- calc_components: AST-afledt
REVOKE ALL ON public.calc_components FROM anon;
DROP POLICY IF EXISTS "Authenticated users can manage components" ON public.calc_components;
DROP POLICY IF EXISTS calc_components_insert_role ON public.calc_components;
DROP POLICY IF EXISTS calc_components_update_role ON public.calc_components;
DROP POLICY IF EXISTS calc_components_delete_role ON public.calc_components;
DROP POLICY IF EXISTS calc_components_select_authenticated ON public.calc_components;
CREATE POLICY calc_components_select_authenticated ON public.calc_components FOR SELECT TO authenticated USING (true);  -- laesning uaendret
CREATE POLICY calc_components_update_role ON public.calc_components FOR UPDATE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder')) WITH CHECK (public.user_role() IN ('admin', 'serviceleder'));

-- calculation_feedback: AST-afledt (4 uafklarede stier vurderet manuelt)
-- anon-grants BEVARES midlertidigt: anon-cron (P-003, rettelse afventer Henrik) — revoke ville skifte tom laesning til fejl (RLS blokerer stadig al anon-skrivning — ingen anon-policies)
DROP POLICY IF EXISTS "Users can manage feedback" ON public.calculation_feedback;
DROP POLICY IF EXISTS calculation_feedback_insert_role ON public.calculation_feedback;
DROP POLICY IF EXISTS calculation_feedback_update_role ON public.calculation_feedback;
DROP POLICY IF EXISTS calculation_feedback_delete_role ON public.calculation_feedback;
DROP POLICY IF EXISTS calculation_feedback_select_authenticated ON public.calculation_feedback;
CREATE POLICY calculation_feedback_select_authenticated ON public.calculation_feedback FOR SELECT TO authenticated USING (true);  -- laesning uaendret
CREATE POLICY calculation_feedback_insert_role ON public.calculation_feedback FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'montør'));

-- calculation_rows: AST-afledt
REVOKE ALL ON public.calculation_rows FROM anon;
DROP POLICY IF EXISTS "Users can create calculation rows" ON public.calculation_rows;
DROP POLICY IF EXISTS "Users can delete calculation rows" ON public.calculation_rows;
DROP POLICY IF EXISTS "Users can update calculation rows" ON public.calculation_rows;
DROP POLICY IF EXISTS calculation_rows_insert_role ON public.calculation_rows;
DROP POLICY IF EXISTS calculation_rows_update_role ON public.calculation_rows;
DROP POLICY IF EXISTS calculation_rows_delete_role ON public.calculation_rows;
DROP POLICY IF EXISTS calculation_rows_select_authenticated ON public.calculation_rows;
CREATE POLICY calculation_rows_insert_role ON public.calculation_rows FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'salg'));
CREATE POLICY calculation_rows_update_role ON public.calculation_rows FOR UPDATE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder', 'salg')) WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'salg'));
CREATE POLICY calculation_rows_delete_role ON public.calculation_rows FOR DELETE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder', 'salg'));

-- calculation_settings: AST-afledt
REVOKE ALL ON public.calculation_settings FROM anon;
DROP POLICY IF EXISTS "Authenticated users can manage calculation settings" ON public.calculation_settings;
DROP POLICY IF EXISTS calculation_settings_insert_role ON public.calculation_settings;
DROP POLICY IF EXISTS calculation_settings_update_role ON public.calculation_settings;
DROP POLICY IF EXISTS calculation_settings_delete_role ON public.calculation_settings;
DROP POLICY IF EXISTS calculation_settings_select_authenticated ON public.calculation_settings;
CREATE POLICY calculation_settings_select_authenticated ON public.calculation_settings FOR SELECT TO authenticated USING (true);  -- laesning uaendret
CREATE POLICY calculation_settings_update_role ON public.calculation_settings FOR UPDATE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder')) WITH CHECK (public.user_role() IN ('admin', 'serviceleder'));

-- calculation_snapshots: AST-afledt
REVOKE ALL ON public.calculation_snapshots FROM anon;
DROP POLICY IF EXISTS "calculation_snapshots_insert" ON public.calculation_snapshots;
DROP POLICY IF EXISTS "calculation_snapshots_update" ON public.calculation_snapshots;
DROP POLICY IF EXISTS calculation_snapshots_insert_role ON public.calculation_snapshots;
DROP POLICY IF EXISTS calculation_snapshots_update_role ON public.calculation_snapshots;
DROP POLICY IF EXISTS calculation_snapshots_delete_role ON public.calculation_snapshots;
DROP POLICY IF EXISTS calculation_snapshots_select_authenticated ON public.calculation_snapshots;
CREATE POLICY calculation_snapshots_insert_role ON public.calculation_snapshots FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'salg'));

-- calculations: AST-afledt
REVOKE ALL ON public.calculations FROM anon;
DROP POLICY IF EXISTS "Users can delete own calculations" ON public.calculations;
DROP POLICY IF EXISTS "Users can update own calculations" ON public.calculations;
DROP POLICY IF EXISTS "Users can create calculations" ON public.calculations;
DROP POLICY IF EXISTS calculations_insert_role ON public.calculations;
DROP POLICY IF EXISTS calculations_update_role ON public.calculations;
DROP POLICY IF EXISTS calculations_delete_role ON public.calculations;
DROP POLICY IF EXISTS calculations_select_authenticated ON public.calculations;
CREATE POLICY calculations_insert_role ON public.calculations FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'salg') AND created_by = auth.uid());
CREATE POLICY calculations_update_role ON public.calculations FOR UPDATE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder', 'salg')) WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'salg'));
CREATE POLICY calculations_delete_role ON public.calculations FOR DELETE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder', 'salg'));

-- calculator_templates: AST-afledt
REVOKE ALL ON public.calculator_templates FROM anon;
DROP POLICY IF EXISTS "Users can create templates" ON public.calculator_templates;
DROP POLICY IF EXISTS "Users can delete templates" ON public.calculator_templates;
DROP POLICY IF EXISTS "Users can update templates" ON public.calculator_templates;
DROP POLICY IF EXISTS calculator_templates_insert_role ON public.calculator_templates;
DROP POLICY IF EXISTS calculator_templates_update_role ON public.calculator_templates;
DROP POLICY IF EXISTS calculator_templates_delete_role ON public.calculator_templates;
DROP POLICY IF EXISTS calculator_templates_select_authenticated ON public.calculator_templates;
CREATE POLICY calculator_templates_insert_role ON public.calculator_templates FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'salg'));
CREATE POLICY calculator_templates_delete_role ON public.calculator_templates FOR DELETE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder', 'salg'));

-- calibration_presets: AST-afledt
REVOKE ALL ON public.calibration_presets FROM anon;
DROP POLICY IF EXISTS "calibration_presets_insert" ON public.calibration_presets;
DROP POLICY IF EXISTS "calibration_presets_update" ON public.calibration_presets;
DROP POLICY IF EXISTS calibration_presets_insert_role ON public.calibration_presets;
DROP POLICY IF EXISTS calibration_presets_update_role ON public.calibration_presets;
DROP POLICY IF EXISTS calibration_presets_delete_role ON public.calibration_presets;
DROP POLICY IF EXISTS calibration_presets_select_authenticated ON public.calibration_presets;
CREATE POLICY calibration_presets_insert_role ON public.calibration_presets FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'salg'));
CREATE POLICY calibration_presets_update_role ON public.calibration_presets FOR UPDATE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder', 'salg')) WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'salg'));
CREATE POLICY calibration_presets_delete_role ON public.calibration_presets FOR DELETE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder', 'salg'));

-- kalkia_building_profiles: AST-afledt
REVOKE ALL ON public.kalkia_building_profiles FROM anon;
DROP POLICY IF EXISTS "Authenticated users can manage kalkia_building_profiles" ON public.kalkia_building_profiles;
DROP POLICY IF EXISTS kalkia_building_profiles_insert_role ON public.kalkia_building_profiles;
DROP POLICY IF EXISTS kalkia_building_profiles_update_role ON public.kalkia_building_profiles;
DROP POLICY IF EXISTS kalkia_building_profiles_delete_role ON public.kalkia_building_profiles;
DROP POLICY IF EXISTS kalkia_building_profiles_select_authenticated ON public.kalkia_building_profiles;
CREATE POLICY kalkia_building_profiles_select_authenticated ON public.kalkia_building_profiles FOR SELECT TO authenticated USING (true);  -- laesning uaendret
CREATE POLICY kalkia_building_profiles_update_role ON public.kalkia_building_profiles FOR UPDATE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder')) WITH CHECK (public.user_role() IN ('admin', 'serviceleder'));

-- kalkia_calculation_rows: AST-afledt
REVOKE ALL ON public.kalkia_calculation_rows FROM anon;
DROP POLICY IF EXISTS "Authenticated users can manage kalkia_calculation_rows" ON public.kalkia_calculation_rows;
DROP POLICY IF EXISTS kalkia_calculation_rows_insert_role ON public.kalkia_calculation_rows;
DROP POLICY IF EXISTS kalkia_calculation_rows_update_role ON public.kalkia_calculation_rows;
DROP POLICY IF EXISTS kalkia_calculation_rows_delete_role ON public.kalkia_calculation_rows;
DROP POLICY IF EXISTS kalkia_calculation_rows_select_authenticated ON public.kalkia_calculation_rows;
CREATE POLICY kalkia_calculation_rows_select_authenticated ON public.kalkia_calculation_rows FOR SELECT TO authenticated USING (true);  -- laesning uaendret
CREATE POLICY kalkia_calculation_rows_insert_role ON public.kalkia_calculation_rows FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'salg'));

-- kalkia_calculations: AST-afledt
REVOKE ALL ON public.kalkia_calculations FROM anon;
DROP POLICY IF EXISTS "Authenticated users can manage kalkia_calculations" ON public.kalkia_calculations;
DROP POLICY IF EXISTS kalkia_calculations_insert_role ON public.kalkia_calculations;
DROP POLICY IF EXISTS kalkia_calculations_update_role ON public.kalkia_calculations;
DROP POLICY IF EXISTS kalkia_calculations_delete_role ON public.kalkia_calculations;
DROP POLICY IF EXISTS kalkia_calculations_select_authenticated ON public.kalkia_calculations;
CREATE POLICY kalkia_calculations_select_authenticated ON public.kalkia_calculations FOR SELECT TO authenticated USING (true);  -- laesning uaendret
CREATE POLICY kalkia_calculations_insert_role ON public.kalkia_calculations FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'salg'));
CREATE POLICY kalkia_calculations_update_role ON public.kalkia_calculations FOR UPDATE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder', 'salg')) WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'salg'));
CREATE POLICY kalkia_calculations_delete_role ON public.kalkia_calculations FOR DELETE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder', 'salg'));

-- kalkia_global_factors: AST-afledt
REVOKE ALL ON public.kalkia_global_factors FROM anon;
DROP POLICY IF EXISTS "Authenticated users can manage kalkia_global_factors" ON public.kalkia_global_factors;
DROP POLICY IF EXISTS kalkia_global_factors_insert_role ON public.kalkia_global_factors;
DROP POLICY IF EXISTS kalkia_global_factors_update_role ON public.kalkia_global_factors;
DROP POLICY IF EXISTS kalkia_global_factors_delete_role ON public.kalkia_global_factors;
DROP POLICY IF EXISTS kalkia_global_factors_select_authenticated ON public.kalkia_global_factors;
CREATE POLICY kalkia_global_factors_select_authenticated ON public.kalkia_global_factors FOR SELECT TO authenticated USING (true);  -- laesning uaendret
CREATE POLICY kalkia_global_factors_update_role ON public.kalkia_global_factors FOR UPDATE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder')) WITH CHECK (public.user_role() IN ('admin', 'serviceleder'));

-- kalkia_nodes: AST-afledt
REVOKE ALL ON public.kalkia_nodes FROM anon;
DROP POLICY IF EXISTS "Authenticated users can manage kalkia_nodes" ON public.kalkia_nodes;
DROP POLICY IF EXISTS kalkia_nodes_insert_role ON public.kalkia_nodes;
DROP POLICY IF EXISTS kalkia_nodes_update_role ON public.kalkia_nodes;
DROP POLICY IF EXISTS kalkia_nodes_delete_role ON public.kalkia_nodes;
DROP POLICY IF EXISTS kalkia_nodes_select_authenticated ON public.kalkia_nodes;
CREATE POLICY kalkia_nodes_select_authenticated ON public.kalkia_nodes FOR SELECT TO authenticated USING (true);  -- laesning uaendret
CREATE POLICY kalkia_nodes_insert_role ON public.kalkia_nodes FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder'));
CREATE POLICY kalkia_nodes_update_role ON public.kalkia_nodes FOR UPDATE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder')) WITH CHECK (public.user_role() IN ('admin', 'serviceleder'));
CREATE POLICY kalkia_nodes_delete_role ON public.kalkia_nodes FOR DELETE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder'));

-- kalkia_rules: AST-afledt
REVOKE ALL ON public.kalkia_rules FROM anon;
DROP POLICY IF EXISTS "Authenticated users can manage kalkia_rules" ON public.kalkia_rules;
DROP POLICY IF EXISTS kalkia_rules_insert_role ON public.kalkia_rules;
DROP POLICY IF EXISTS kalkia_rules_update_role ON public.kalkia_rules;
DROP POLICY IF EXISTS kalkia_rules_delete_role ON public.kalkia_rules;
DROP POLICY IF EXISTS kalkia_rules_select_authenticated ON public.kalkia_rules;
CREATE POLICY kalkia_rules_select_authenticated ON public.kalkia_rules FOR SELECT TO authenticated USING (true);  -- laesning uaendret

-- kalkia_variant_materials: AST-afledt
REVOKE ALL ON public.kalkia_variant_materials FROM anon;
DROP POLICY IF EXISTS "Authenticated users can manage kalkia_variant_materials" ON public.kalkia_variant_materials;
DROP POLICY IF EXISTS kalkia_variant_materials_insert_role ON public.kalkia_variant_materials;
DROP POLICY IF EXISTS kalkia_variant_materials_update_role ON public.kalkia_variant_materials;
DROP POLICY IF EXISTS kalkia_variant_materials_delete_role ON public.kalkia_variant_materials;
DROP POLICY IF EXISTS kalkia_variant_materials_select_authenticated ON public.kalkia_variant_materials;
CREATE POLICY kalkia_variant_materials_select_authenticated ON public.kalkia_variant_materials FOR SELECT TO authenticated USING (true);  -- laesning uaendret
CREATE POLICY kalkia_variant_materials_insert_role ON public.kalkia_variant_materials FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder'));
CREATE POLICY kalkia_variant_materials_update_role ON public.kalkia_variant_materials FOR UPDATE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder')) WITH CHECK (public.user_role() IN ('admin', 'serviceleder'));
CREATE POLICY kalkia_variant_materials_delete_role ON public.kalkia_variant_materials FOR DELETE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder'));

-- kalkia_variants: AST-afledt
REVOKE ALL ON public.kalkia_variants FROM anon;
DROP POLICY IF EXISTS "Authenticated users can manage kalkia_variants" ON public.kalkia_variants;
DROP POLICY IF EXISTS kalkia_variants_insert_role ON public.kalkia_variants;
DROP POLICY IF EXISTS kalkia_variants_update_role ON public.kalkia_variants;
DROP POLICY IF EXISTS kalkia_variants_delete_role ON public.kalkia_variants;
DROP POLICY IF EXISTS kalkia_variants_select_authenticated ON public.kalkia_variants;
CREATE POLICY kalkia_variants_select_authenticated ON public.kalkia_variants FOR SELECT TO authenticated USING (true);  -- laesning uaendret
CREATE POLICY kalkia_variants_insert_role ON public.kalkia_variants FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder'));
CREATE POLICY kalkia_variants_update_role ON public.kalkia_variants FOR UPDATE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder')) WITH CHECK (public.user_role() IN ('admin', 'serviceleder'));
CREATE POLICY kalkia_variants_delete_role ON public.kalkia_variants FOR DELETE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder'));

-- material_price_history: AST-afledt
REVOKE ALL ON public.material_price_history FROM anon;
DROP POLICY IF EXISTS "material_price_history_insert" ON public.material_price_history;
DROP POLICY IF EXISTS material_price_history_insert_role ON public.material_price_history;
DROP POLICY IF EXISTS material_price_history_update_role ON public.material_price_history;
DROP POLICY IF EXISTS material_price_history_delete_role ON public.material_price_history;
DROP POLICY IF EXISTS material_price_history_select_authenticated ON public.material_price_history;
CREATE POLICY material_price_history_insert_role ON public.material_price_history FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder'));

-- materials: AST-afledt
REVOKE ALL ON public.materials FROM anon;
DROP POLICY IF EXISTS "materials_delete" ON public.materials;
DROP POLICY IF EXISTS "materials_insert" ON public.materials;
DROP POLICY IF EXISTS "materials_update" ON public.materials;
DROP POLICY IF EXISTS materials_insert_role ON public.materials;
DROP POLICY IF EXISTS materials_update_role ON public.materials;
DROP POLICY IF EXISTS materials_delete_role ON public.materials;
DROP POLICY IF EXISTS materials_select_authenticated ON public.materials;

-- materials_catalog: AST-afledt
REVOKE ALL ON public.materials_catalog FROM anon;
DROP POLICY IF EXISTS "materials_catalog_modify" ON public.materials_catalog;
DROP POLICY IF EXISTS materials_catalog_insert_role ON public.materials_catalog;
DROP POLICY IF EXISTS materials_catalog_update_role ON public.materials_catalog;
DROP POLICY IF EXISTS materials_catalog_delete_role ON public.materials_catalog;
DROP POLICY IF EXISTS materials_catalog_select_authenticated ON public.materials_catalog;
CREATE POLICY materials_catalog_select_authenticated ON public.materials_catalog FOR SELECT TO authenticated USING (true);  -- laesning uaendret
CREATE POLICY materials_catalog_insert_role ON public.materials_catalog FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder'));
CREATE POLICY materials_catalog_update_role ON public.materials_catalog FOR UPDATE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder')) WITH CHECK (public.user_role() IN ('admin', 'serviceleder'));

-- package_categories: AST-afledt
REVOKE ALL ON public.package_categories FROM anon;
DROP POLICY IF EXISTS "Authenticated users can manage package categories" ON public.package_categories;
DROP POLICY IF EXISTS package_categories_insert_role ON public.package_categories;
DROP POLICY IF EXISTS package_categories_update_role ON public.package_categories;
DROP POLICY IF EXISTS package_categories_delete_role ON public.package_categories;
DROP POLICY IF EXISTS package_categories_select_authenticated ON public.package_categories;
CREATE POLICY package_categories_select_authenticated ON public.package_categories FOR SELECT TO authenticated USING (true);  -- laesning uaendret

-- package_items: AST-afledt
REVOKE ALL ON public.package_items FROM anon;
DROP POLICY IF EXISTS "Authenticated users can create package items" ON public.package_items;
DROP POLICY IF EXISTS "Authenticated users can delete package items" ON public.package_items;
DROP POLICY IF EXISTS "Authenticated users can update package items" ON public.package_items;
DROP POLICY IF EXISTS package_items_insert_role ON public.package_items;
DROP POLICY IF EXISTS package_items_update_role ON public.package_items;
DROP POLICY IF EXISTS package_items_delete_role ON public.package_items;
DROP POLICY IF EXISTS package_items_select_authenticated ON public.package_items;
CREATE POLICY package_items_insert_role ON public.package_items FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder'));
CREATE POLICY package_items_update_role ON public.package_items FOR UPDATE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder')) WITH CHECK (public.user_role() IN ('admin', 'serviceleder'));
CREATE POLICY package_items_delete_role ON public.package_items FOR DELETE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder'));

-- package_options: AST-afledt (3 uafklarede stier vurderet manuelt)
REVOKE ALL ON public.package_options FROM anon;
DROP POLICY IF EXISTS "package_options_all_auth" ON public.package_options;
DROP POLICY IF EXISTS package_options_insert_role ON public.package_options;
DROP POLICY IF EXISTS package_options_update_role ON public.package_options;
DROP POLICY IF EXISTS package_options_delete_role ON public.package_options;
DROP POLICY IF EXISTS package_options_select_authenticated ON public.package_options;
CREATE POLICY package_options_select_authenticated ON public.package_options FOR SELECT TO authenticated USING (true);  -- laesning uaendret
CREATE POLICY package_options_insert_role ON public.package_options FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin'));
CREATE POLICY package_options_update_role ON public.package_options FOR UPDATE TO authenticated USING (public.user_role() IN ('admin')) WITH CHECK (public.user_role() IN ('admin'));
CREATE POLICY package_options_delete_role ON public.package_options FOR DELETE TO authenticated USING (public.user_role() IN ('admin'));

-- packages: AST-afledt
REVOKE ALL ON public.packages FROM anon;
DROP POLICY IF EXISTS "Authenticated users can create packages" ON public.packages;
DROP POLICY IF EXISTS "Authenticated users can delete packages" ON public.packages;
DROP POLICY IF EXISTS "Authenticated users can update packages" ON public.packages;
DROP POLICY IF EXISTS packages_insert_role ON public.packages;
DROP POLICY IF EXISTS packages_update_role ON public.packages;
DROP POLICY IF EXISTS packages_delete_role ON public.packages;
DROP POLICY IF EXISTS packages_select_authenticated ON public.packages;
CREATE POLICY packages_insert_role ON public.packages FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder'));
CREATE POLICY packages_update_role ON public.packages FOR UPDATE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder')) WITH CHECK (public.user_role() IN ('admin', 'serviceleder'));
CREATE POLICY packages_delete_role ON public.packages FOR DELETE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder'));

-- price_explanations: AST-afledt
REVOKE ALL ON public.price_explanations FROM anon;
DROP POLICY IF EXISTS "price_explanations_delete" ON public.price_explanations;
DROP POLICY IF EXISTS "price_explanations_insert" ON public.price_explanations;
DROP POLICY IF EXISTS "price_explanations_update" ON public.price_explanations;
DROP POLICY IF EXISTS price_explanations_insert_role ON public.price_explanations;
DROP POLICY IF EXISTS price_explanations_update_role ON public.price_explanations;
DROP POLICY IF EXISTS price_explanations_delete_role ON public.price_explanations;
DROP POLICY IF EXISTS price_explanations_select_authenticated ON public.price_explanations;
CREATE POLICY price_explanations_insert_role ON public.price_explanations FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'salg'));

-- product_catalog: AST-afledt
REVOKE ALL ON public.product_catalog FROM anon;
DROP POLICY IF EXISTS "Authenticated users can create products" ON public.product_catalog;
DROP POLICY IF EXISTS "Authenticated users can delete products" ON public.product_catalog;
DROP POLICY IF EXISTS "Authenticated users can update products" ON public.product_catalog;
DROP POLICY IF EXISTS product_catalog_insert_role ON public.product_catalog;
DROP POLICY IF EXISTS product_catalog_update_role ON public.product_catalog;
DROP POLICY IF EXISTS product_catalog_delete_role ON public.product_catalog;
DROP POLICY IF EXISTS product_catalog_select_authenticated ON public.product_catalog;
CREATE POLICY product_catalog_insert_role ON public.product_catalog FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder'));
CREATE POLICY product_catalog_update_role ON public.product_catalog FOR UPDATE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder')) WITH CHECK (public.user_role() IN ('admin', 'serviceleder'));
CREATE POLICY product_catalog_delete_role ON public.product_catalog FOR DELETE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder'));

-- product_categories: AST-afledt
REVOKE ALL ON public.product_categories FROM anon;
DROP POLICY IF EXISTS "Authenticated users can create product categories" ON public.product_categories;
DROP POLICY IF EXISTS "Authenticated users can delete product categories" ON public.product_categories;
DROP POLICY IF EXISTS "Authenticated users can update product categories" ON public.product_categories;
DROP POLICY IF EXISTS product_categories_insert_role ON public.product_categories;
DROP POLICY IF EXISTS product_categories_update_role ON public.product_categories;
DROP POLICY IF EXISTS product_categories_delete_role ON public.product_categories;
DROP POLICY IF EXISTS product_categories_select_authenticated ON public.product_categories;
CREATE POLICY product_categories_insert_role ON public.product_categories FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder'));
CREATE POLICY product_categories_update_role ON public.product_categories FOR UPDATE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder')) WITH CHECK (public.user_role() IN ('admin', 'serviceleder'));
CREATE POLICY product_categories_delete_role ON public.product_categories FOR DELETE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder'));

-- project_contexts: AST-afledt
REVOKE ALL ON public.project_contexts FROM anon;
DROP POLICY IF EXISTS "project_contexts_delete" ON public.project_contexts;
DROP POLICY IF EXISTS "project_contexts_insert" ON public.project_contexts;
DROP POLICY IF EXISTS "project_contexts_update" ON public.project_contexts;
DROP POLICY IF EXISTS project_contexts_insert_role ON public.project_contexts;
DROP POLICY IF EXISTS project_contexts_update_role ON public.project_contexts;
DROP POLICY IF EXISTS project_contexts_delete_role ON public.project_contexts;
DROP POLICY IF EXISTS project_contexts_select_authenticated ON public.project_contexts;
CREATE POLICY project_contexts_insert_role ON public.project_contexts FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'salg'));

-- project_interpretations: AST-afledt
REVOKE ALL ON public.project_interpretations FROM anon;
DROP POLICY IF EXISTS "Users can manage interpretations" ON public.project_interpretations;
DROP POLICY IF EXISTS project_interpretations_insert_role ON public.project_interpretations;
DROP POLICY IF EXISTS project_interpretations_update_role ON public.project_interpretations;
DROP POLICY IF EXISTS project_interpretations_delete_role ON public.project_interpretations;
DROP POLICY IF EXISTS project_interpretations_select_authenticated ON public.project_interpretations;
CREATE POLICY project_interpretations_select_authenticated ON public.project_interpretations FOR SELECT TO authenticated USING (true);  -- laesning uaendret
CREATE POLICY project_interpretations_insert_role ON public.project_interpretations FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder'));

-- project_keywords: AST-afledt
REVOKE ALL ON public.project_keywords FROM anon;
DROP POLICY IF EXISTS "project_keywords_insert" ON public.project_keywords;
DROP POLICY IF EXISTS "project_keywords_update" ON public.project_keywords;
DROP POLICY IF EXISTS project_keywords_insert_role ON public.project_keywords;
DROP POLICY IF EXISTS project_keywords_update_role ON public.project_keywords;
DROP POLICY IF EXISTS project_keywords_delete_role ON public.project_keywords;
DROP POLICY IF EXISTS project_keywords_select_authenticated ON public.project_keywords;

-- project_risks: AST-afledt
REVOKE ALL ON public.project_risks FROM anon;
DROP POLICY IF EXISTS "Users can manage risks" ON public.project_risks;
DROP POLICY IF EXISTS project_risks_insert_role ON public.project_risks;
DROP POLICY IF EXISTS project_risks_update_role ON public.project_risks;
DROP POLICY IF EXISTS project_risks_delete_role ON public.project_risks;
DROP POLICY IF EXISTS project_risks_select_authenticated ON public.project_risks;
CREATE POLICY project_risks_select_authenticated ON public.project_risks FOR SELECT TO authenticated USING (true);  -- laesning uaendret
CREATE POLICY project_risks_insert_role ON public.project_risks FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder'));

-- project_templates: AST-afledt
REVOKE ALL ON public.project_templates FROM anon;
DROP POLICY IF EXISTS "Authenticated users can manage project templates" ON public.project_templates;
DROP POLICY IF EXISTS project_templates_insert_role ON public.project_templates;
DROP POLICY IF EXISTS project_templates_update_role ON public.project_templates;
DROP POLICY IF EXISTS project_templates_delete_role ON public.project_templates;
DROP POLICY IF EXISTS project_templates_select_authenticated ON public.project_templates;
CREATE POLICY project_templates_select_authenticated ON public.project_templates FOR SELECT TO authenticated USING (true);  -- laesning uaendret

-- risk_assessments: AST-afledt
REVOKE ALL ON public.risk_assessments FROM anon;
DROP POLICY IF EXISTS "risk_assessments_delete" ON public.risk_assessments;
DROP POLICY IF EXISTS "risk_assessments_insert" ON public.risk_assessments;
DROP POLICY IF EXISTS "risk_assessments_update" ON public.risk_assessments;
DROP POLICY IF EXISTS risk_assessments_insert_role ON public.risk_assessments;
DROP POLICY IF EXISTS risk_assessments_update_role ON public.risk_assessments;
DROP POLICY IF EXISTS risk_assessments_delete_role ON public.risk_assessments;
DROP POLICY IF EXISTS risk_assessments_select_authenticated ON public.risk_assessments;
CREATE POLICY risk_assessments_insert_role ON public.risk_assessments FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'salg'));
CREATE POLICY risk_assessments_update_role ON public.risk_assessments FOR UPDATE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder', 'salg')) WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'salg'));

-- risk_detection_rules: AST-afledt
REVOKE ALL ON public.risk_detection_rules FROM anon;
DROP POLICY IF EXISTS "risk_detection_rules_insert" ON public.risk_detection_rules;
DROP POLICY IF EXISTS "risk_detection_rules_update" ON public.risk_detection_rules;
DROP POLICY IF EXISTS risk_detection_rules_insert_role ON public.risk_detection_rules;
DROP POLICY IF EXISTS risk_detection_rules_update_role ON public.risk_detection_rules;
DROP POLICY IF EXISTS risk_detection_rules_delete_role ON public.risk_detection_rules;
DROP POLICY IF EXISTS risk_detection_rules_select_authenticated ON public.risk_detection_rules;

-- room_templates: AST-afledt
REVOKE ALL ON public.room_templates FROM anon;
DROP POLICY IF EXISTS "room_templates_modify" ON public.room_templates;
DROP POLICY IF EXISTS room_templates_insert_role ON public.room_templates;
DROP POLICY IF EXISTS room_templates_update_role ON public.room_templates;
DROP POLICY IF EXISTS room_templates_delete_role ON public.room_templates;
DROP POLICY IF EXISTS room_templates_select_authenticated ON public.room_templates;
CREATE POLICY room_templates_select_authenticated ON public.room_templates FOR SELECT TO authenticated USING (true);  -- laesning uaendret
CREATE POLICY room_templates_insert_role ON public.room_templates FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder'));
CREATE POLICY room_templates_update_role ON public.room_templates FOR UPDATE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder')) WITH CHECK (public.user_role() IN ('admin', 'serviceleder'));
CREATE POLICY room_templates_delete_role ON public.room_templates FOR DELETE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder'));

-- room_types: AST-afledt
REVOKE ALL ON public.room_types FROM anon;
DROP POLICY IF EXISTS "room_types_modify" ON public.room_types;
DROP POLICY IF EXISTS room_types_insert_role ON public.room_types;
DROP POLICY IF EXISTS room_types_update_role ON public.room_types;
DROP POLICY IF EXISTS room_types_delete_role ON public.room_types;
DROP POLICY IF EXISTS room_types_select_authenticated ON public.room_types;
CREATE POLICY room_types_select_authenticated ON public.room_types FOR SELECT TO authenticated USING (true);  -- laesning uaendret
CREATE POLICY room_types_insert_role ON public.room_types FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder'));
CREATE POLICY room_types_update_role ON public.room_types FOR UPDATE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder')) WITH CHECK (public.user_role() IN ('admin', 'serviceleder'));
CREATE POLICY room_types_delete_role ON public.room_types FOR DELETE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder'));

-- sales_text_blocks: AST-afledt (2 uafklarede stier vurderet manuelt)
REVOKE ALL ON public.sales_text_blocks FROM anon;
DROP POLICY IF EXISTS "sales_text_blocks_all_auth" ON public.sales_text_blocks;
DROP POLICY IF EXISTS sales_text_blocks_insert_role ON public.sales_text_blocks;
DROP POLICY IF EXISTS sales_text_blocks_update_role ON public.sales_text_blocks;
DROP POLICY IF EXISTS sales_text_blocks_delete_role ON public.sales_text_blocks;
DROP POLICY IF EXISTS sales_text_blocks_select_authenticated ON public.sales_text_blocks;
CREATE POLICY sales_text_blocks_select_authenticated ON public.sales_text_blocks FOR SELECT TO authenticated USING (true);  -- laesning uaendret
CREATE POLICY sales_text_blocks_insert_role ON public.sales_text_blocks FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin'));
CREATE POLICY sales_text_blocks_update_role ON public.sales_text_blocks FOR UPDATE TO authenticated USING (public.user_role() IN ('admin')) WITH CHECK (public.user_role() IN ('admin'));

-- solar_products: AST-afledt
REVOKE ALL ON public.solar_products FROM anon;
DROP POLICY IF EXISTS "Authenticated users can delete solar products" ON public.solar_products;
DROP POLICY IF EXISTS "Authenticated users can insert solar products" ON public.solar_products;
DROP POLICY IF EXISTS "Authenticated users can update solar products" ON public.solar_products;
DROP POLICY IF EXISTS solar_products_insert_role ON public.solar_products;
DROP POLICY IF EXISTS solar_products_update_role ON public.solar_products;
DROP POLICY IF EXISTS solar_products_delete_role ON public.solar_products;
DROP POLICY IF EXISTS solar_products_select_authenticated ON public.solar_products;
CREATE POLICY solar_products_insert_role ON public.solar_products FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder'));
CREATE POLICY solar_products_update_role ON public.solar_products FOR UPDATE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder')) WITH CHECK (public.user_role() IN ('admin', 'serviceleder'));

NOTIFY pgrst, 'reload schema';

COMMIT;
