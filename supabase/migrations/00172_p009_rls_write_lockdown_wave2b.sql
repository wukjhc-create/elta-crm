-- =====================================================================
-- 00172 — P-009 RLS-skrivelås, WAVE2B (supplier_products, supplier_product_cache, price_history, supplier_sync_logs, supplier_sync_jobs, supplier_sync_schedules, supplier_margin_rules, customer_supplier_prices, customer_product_prices, import_batches)
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

-- supplier_products: ~324k priser: kun settings.suppliers (admin); API-cache/prisopdatering skrives som service-role
-- anon-grants BEVARES midlertidigt: supplier-sync-cron bruger anon-klient (P-003, rettelse afventer Henrik) — revoke ville skifte tom laesning til fejl (RLS blokerer stadig al anon-skrivning — ingen anon-policies)
DROP POLICY IF EXISTS "Authenticated users can create supplier products" ON public.supplier_products;
DROP POLICY IF EXISTS "Authenticated users can update supplier products" ON public.supplier_products;
DROP POLICY IF EXISTS "Authenticated users can delete supplier products" ON public.supplier_products;
DROP POLICY IF EXISTS supplier_products_insert_role ON public.supplier_products;
DROP POLICY IF EXISTS supplier_products_update_role ON public.supplier_products;
DROP POLICY IF EXISTS supplier_products_delete_role ON public.supplier_products;
DROP POLICY IF EXISTS supplier_products_select_authenticated ON public.supplier_products;
CREATE POLICY supplier_products_insert_role ON public.supplier_products FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin'));
CREATE POLICY supplier_products_update_role ON public.supplier_products FOR UPDATE TO authenticated USING (public.user_role() IN ('admin')) WITH CHECK (public.user_role() IN ('admin'));
CREATE POLICY supplier_products_delete_role ON public.supplier_products FOR DELETE TO authenticated USING (public.user_role() IN ('admin'));

-- supplier_product_cache: offline-prisscache skrives KUN af system (service-role)
REVOKE ALL ON public.supplier_product_cache FROM anon;
DROP POLICY IF EXISTS "Authenticated users can manage product cache" ON public.supplier_product_cache;
DROP POLICY IF EXISTS "Authenticated users can update product cache" ON public.supplier_product_cache;
DROP POLICY IF EXISTS supplier_product_cache_insert_role ON public.supplier_product_cache;
DROP POLICY IF EXISTS supplier_product_cache_update_role ON public.supplier_product_cache;
DROP POLICY IF EXISTS supplier_product_cache_delete_role ON public.supplier_product_cache;
DROP POLICY IF EXISTS supplier_product_cache_select_authenticated ON public.supplier_product_cache;

-- price_history: prishistorik: import/sync (settings.suppliers); ellers system; append-only
-- anon-grants BEVARES midlertidigt: supplier-sync-cron bruger anon-klient (P-003, rettelse afventer Henrik) — revoke ville skifte tom laesning til fejl (RLS blokerer stadig al anon-skrivning — ingen anon-policies)
DROP POLICY IF EXISTS "Authenticated users can create price history" ON public.price_history;
DROP POLICY IF EXISTS price_history_insert_role ON public.price_history;
DROP POLICY IF EXISTS price_history_update_role ON public.price_history;
DROP POLICY IF EXISTS price_history_delete_role ON public.price_history;
DROP POLICY IF EXISTS price_history_select_authenticated ON public.price_history;
CREATE POLICY price_history_insert_role ON public.price_history FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin'));

-- supplier_sync_logs: sync-log (settings.suppliers)
-- anon-grants BEVARES midlertidigt: supplier-sync-cron bruger anon-klient (P-003, rettelse afventer Henrik) — revoke ville skifte tom laesning til fejl (RLS blokerer stadig al anon-skrivning — ingen anon-policies)
DROP POLICY IF EXISTS "Authenticated users can create sync logs" ON public.supplier_sync_logs;
DROP POLICY IF EXISTS "Authenticated users can update sync logs" ON public.supplier_sync_logs;
DROP POLICY IF EXISTS supplier_sync_logs_insert_role ON public.supplier_sync_logs;
DROP POLICY IF EXISTS supplier_sync_logs_update_role ON public.supplier_sync_logs;
DROP POLICY IF EXISTS supplier_sync_logs_delete_role ON public.supplier_sync_logs;
DROP POLICY IF EXISTS supplier_sync_logs_select_authenticated ON public.supplier_sync_logs;
CREATE POLICY supplier_sync_logs_insert_role ON public.supplier_sync_logs FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin'));
CREATE POLICY supplier_sync_logs_update_role ON public.supplier_sync_logs FOR UPDATE TO authenticated USING (public.user_role() IN ('admin')) WITH CHECK (public.user_role() IN ('admin'));

-- supplier_sync_jobs: sync-jobs (settings.suppliers)
REVOKE ALL ON public.supplier_sync_jobs FROM anon;
DROP POLICY IF EXISTS "Authenticated users can manage sync jobs" ON public.supplier_sync_jobs;
DROP POLICY IF EXISTS "Authenticated users can update sync jobs" ON public.supplier_sync_jobs;
DROP POLICY IF EXISTS "Authenticated users can delete sync jobs" ON public.supplier_sync_jobs;
DROP POLICY IF EXISTS supplier_sync_jobs_insert_role ON public.supplier_sync_jobs;
DROP POLICY IF EXISTS supplier_sync_jobs_update_role ON public.supplier_sync_jobs;
DROP POLICY IF EXISTS supplier_sync_jobs_delete_role ON public.supplier_sync_jobs;
DROP POLICY IF EXISTS supplier_sync_jobs_select_authenticated ON public.supplier_sync_jobs;
CREATE POLICY supplier_sync_jobs_insert_role ON public.supplier_sync_jobs FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin'));
CREATE POLICY supplier_sync_jobs_update_role ON public.supplier_sync_jobs FOR UPDATE TO authenticated USING (public.user_role() IN ('admin')) WITH CHECK (public.user_role() IN ('admin'));
CREATE POLICY supplier_sync_jobs_delete_role ON public.supplier_sync_jobs FOR DELETE TO authenticated USING (public.user_role() IN ('admin'));

-- supplier_sync_schedules: sync-planer (settings.suppliers)
-- anon-grants BEVARES midlertidigt: supplier-sync-cron bruger anon-klient (P-003, rettelse afventer Henrik) — revoke ville skifte tom laesning til fejl (RLS blokerer stadig al anon-skrivning — ingen anon-policies)
DROP POLICY IF EXISTS "Authenticated users can manage sync schedules" ON public.supplier_sync_schedules;
DROP POLICY IF EXISTS "Authenticated users can update sync schedules" ON public.supplier_sync_schedules;
DROP POLICY IF EXISTS "Authenticated users can delete sync schedules" ON public.supplier_sync_schedules;
DROP POLICY IF EXISTS supplier_sync_schedules_insert_role ON public.supplier_sync_schedules;
DROP POLICY IF EXISTS supplier_sync_schedules_update_role ON public.supplier_sync_schedules;
DROP POLICY IF EXISTS supplier_sync_schedules_delete_role ON public.supplier_sync_schedules;
DROP POLICY IF EXISTS supplier_sync_schedules_select_authenticated ON public.supplier_sync_schedules;
CREATE POLICY supplier_sync_schedules_insert_role ON public.supplier_sync_schedules FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin'));
CREATE POLICY supplier_sync_schedules_update_role ON public.supplier_sync_schedules FOR UPDATE TO authenticated USING (public.user_role() IN ('admin')) WITH CHECK (public.user_role() IN ('admin'));
CREATE POLICY supplier_sync_schedules_delete_role ON public.supplier_sync_schedules FOR DELETE TO authenticated USING (public.user_role() IN ('admin'));

-- supplier_margin_rules: prisregler (settings.suppliers)
REVOKE ALL ON public.supplier_margin_rules FROM anon;
DROP POLICY IF EXISTS "Authenticated users can manage margin rules" ON public.supplier_margin_rules;
DROP POLICY IF EXISTS "Authenticated users can update margin rules" ON public.supplier_margin_rules;
DROP POLICY IF EXISTS "Authenticated users can delete margin rules" ON public.supplier_margin_rules;
DROP POLICY IF EXISTS supplier_margin_rules_insert_role ON public.supplier_margin_rules;
DROP POLICY IF EXISTS supplier_margin_rules_update_role ON public.supplier_margin_rules;
DROP POLICY IF EXISTS supplier_margin_rules_delete_role ON public.supplier_margin_rules;
DROP POLICY IF EXISTS supplier_margin_rules_select_authenticated ON public.supplier_margin_rules;
CREATE POLICY supplier_margin_rules_insert_role ON public.supplier_margin_rules FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin'));
CREATE POLICY supplier_margin_rules_update_role ON public.supplier_margin_rules FOR UPDATE TO authenticated USING (public.user_role() IN ('admin')) WITH CHECK (public.user_role() IN ('admin'));
CREATE POLICY supplier_margin_rules_delete_role ON public.supplier_margin_rules FOR DELETE TO authenticated USING (public.user_role() IN ('admin'));

-- customer_supplier_prices: kundeaftaler (tools.pricing)
REVOKE ALL ON public.customer_supplier_prices FROM anon;
DROP POLICY IF EXISTS "Authenticated users can manage customer supplier prices" ON public.customer_supplier_prices;
DROP POLICY IF EXISTS "Authenticated users can update customer supplier prices" ON public.customer_supplier_prices;
DROP POLICY IF EXISTS "Authenticated users can delete customer supplier prices" ON public.customer_supplier_prices;
DROP POLICY IF EXISTS customer_supplier_prices_insert_role ON public.customer_supplier_prices;
DROP POLICY IF EXISTS customer_supplier_prices_update_role ON public.customer_supplier_prices;
DROP POLICY IF EXISTS customer_supplier_prices_delete_role ON public.customer_supplier_prices;
DROP POLICY IF EXISTS customer_supplier_prices_select_authenticated ON public.customer_supplier_prices;
CREATE POLICY customer_supplier_prices_insert_role ON public.customer_supplier_prices FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder'));
CREATE POLICY customer_supplier_prices_update_role ON public.customer_supplier_prices FOR UPDATE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder')) WITH CHECK (public.user_role() IN ('admin', 'serviceleder'));
CREATE POLICY customer_supplier_prices_delete_role ON public.customer_supplier_prices FOR DELETE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder'));

-- customer_product_prices: kundepriser (tools.pricing); ingen sletning i appen
REVOKE ALL ON public.customer_product_prices FROM anon;
DROP POLICY IF EXISTS "Authenticated users can manage customer product prices" ON public.customer_product_prices;
DROP POLICY IF EXISTS "Authenticated users can update customer product prices" ON public.customer_product_prices;
DROP POLICY IF EXISTS "Authenticated users can delete customer product prices" ON public.customer_product_prices;
DROP POLICY IF EXISTS customer_product_prices_insert_role ON public.customer_product_prices;
DROP POLICY IF EXISTS customer_product_prices_update_role ON public.customer_product_prices;
DROP POLICY IF EXISTS customer_product_prices_delete_role ON public.customer_product_prices;
DROP POLICY IF EXISTS customer_product_prices_select_authenticated ON public.customer_product_prices;
CREATE POLICY customer_product_prices_insert_role ON public.customer_product_prices FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder'));
CREATE POLICY customer_product_prices_update_role ON public.customer_product_prices FOR UPDATE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder')) WITH CHECK (public.user_role() IN ('admin', 'serviceleder'));

-- import_batches: CSV-import (settings.suppliers)
REVOKE ALL ON public.import_batches FROM anon;
DROP POLICY IF EXISTS "Authenticated users can create import batches" ON public.import_batches;
DROP POLICY IF EXISTS "Authenticated users can update import batches" ON public.import_batches;
DROP POLICY IF EXISTS import_batches_insert_role ON public.import_batches;
DROP POLICY IF EXISTS import_batches_update_role ON public.import_batches;
DROP POLICY IF EXISTS import_batches_delete_role ON public.import_batches;
DROP POLICY IF EXISTS import_batches_select_authenticated ON public.import_batches;
CREATE POLICY import_batches_insert_role ON public.import_batches FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin'));
CREATE POLICY import_batches_update_role ON public.import_batches FOR UPDATE TO authenticated USING (public.user_role() IN ('admin')) WITH CHECK (public.user_role() IN ('admin'));

NOTIFY pgrst, 'reload schema';

COMMIT;
