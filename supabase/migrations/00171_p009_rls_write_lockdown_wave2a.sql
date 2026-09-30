-- =====================================================================
-- 00171 — P-009 RLS-skrivelås, WAVE2A (invoice_lines, invoice_predecessors, work_orders, work_order_profit, time_entries, integrations, integration_endpoints, integration_webhooks, integration_queue, integration_logs, external_references, automation_rules, automation_executions, email_templates, sms_templates)
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

-- invoice_lines: fakturalinjer skrives KUN af service-role (faktura-services) -> ingen REST-skrivning
REVOKE ALL ON public.invoice_lines FROM anon;
DROP POLICY IF EXISTS "invoice_lines_all_auth" ON public.invoice_lines;
DROP POLICY IF EXISTS invoice_lines_insert_role ON public.invoice_lines;
DROP POLICY IF EXISTS invoice_lines_update_role ON public.invoice_lines;
DROP POLICY IF EXISTS invoice_lines_delete_role ON public.invoice_lines;
DROP POLICY IF EXISTS invoice_lines_select_authenticated ON public.invoice_lines;
CREATE POLICY invoice_lines_select_authenticated ON public.invoice_lines FOR SELECT TO authenticated USING (true);  -- laesning uaendret

-- invoice_predecessors: a conto-fradrag skrives KUN af service-role
REVOKE ALL ON public.invoice_predecessors FROM anon;
DROP POLICY IF EXISTS "invoice_predecessors_all_auth" ON public.invoice_predecessors;
DROP POLICY IF EXISTS invoice_predecessors_insert_role ON public.invoice_predecessors;
DROP POLICY IF EXISTS invoice_predecessors_update_role ON public.invoice_predecessors;
DROP POLICY IF EXISTS invoice_predecessors_delete_role ON public.invoice_predecessors;
DROP POLICY IF EXISTS invoice_predecessors_select_authenticated ON public.invoice_predecessors;
CREATE POLICY invoice_predecessors_select_authenticated ON public.invoice_predecessors FOR SELECT TO authenticated USING (true);  -- laesning uaendret

-- work_orders: work_orders.plan/edit/delete (admin, serviceleder); montør: work_orders.complete (kun status -> done)
REVOKE ALL ON public.work_orders FROM anon;
DROP POLICY IF EXISTS "work_orders_all_auth" ON public.work_orders;
DROP POLICY IF EXISTS work_orders_insert_role ON public.work_orders;
DROP POLICY IF EXISTS work_orders_update_role ON public.work_orders;
DROP POLICY IF EXISTS work_orders_delete_role ON public.work_orders;
DROP POLICY IF EXISTS work_orders_select_authenticated ON public.work_orders;
CREATE POLICY work_orders_select_authenticated ON public.work_orders FOR SELECT TO authenticated USING (true);  -- laesning uaendret
CREATE POLICY work_orders_insert_role ON public.work_orders FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder'));
CREATE POLICY work_orders_update_role ON public.work_orders FOR UPDATE TO authenticated USING ((public.user_role() IN ('admin', 'serviceleder')) OR (public.user_role() IN ('montør'))) WITH CHECK ((public.user_role() IN ('admin', 'serviceleder')) OR (public.user_role() IN ('montør') AND status = 'done'));
CREATE POLICY work_orders_delete_role ON public.work_orders FOR DELETE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder'));

-- work_order_profit: daekningsbidrag skrives KUN af system (service-role + trigger-funktioner som ejer)
REVOKE ALL ON public.work_order_profit FROM anon;
DROP POLICY IF EXISTS "wo_profit_all_auth" ON public.work_order_profit;
DROP POLICY IF EXISTS work_order_profit_insert_role ON public.work_order_profit;
DROP POLICY IF EXISTS work_order_profit_update_role ON public.work_order_profit;
DROP POLICY IF EXISTS work_order_profit_delete_role ON public.work_order_profit;
DROP POLICY IF EXISTS work_order_profit_select_authenticated ON public.work_order_profit;
CREATE POLICY work_order_profit_select_authenticated ON public.work_order_profit FOR SELECT TO authenticated USING (true);  -- laesning uaendret
ALTER FUNCTION public.trg_work_order_done_snapshot_profit() SECURITY DEFINER SET search_path = public, pg_temp;
ALTER FUNCTION public.trg_invoice_snapshot_profit() SECURITY DEFINER SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.trg_work_order_done_snapshot_profit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_invoice_snapshot_profit() FROM PUBLIC, anon, authenticated;

-- time_entries: time.log/time.edit_own = egne raekker; time.edit_all/time.delete = admin
REVOKE ALL ON public.time_entries FROM anon;
DROP POLICY IF EXISTS "Users can manage time entries" ON public.time_entries;
DROP POLICY IF EXISTS time_entries_insert_role ON public.time_entries;
DROP POLICY IF EXISTS time_entries_update_role ON public.time_entries;
DROP POLICY IF EXISTS time_entries_delete_role ON public.time_entries;
DROP POLICY IF EXISTS time_entries_select_authenticated ON public.time_entries;
CREATE POLICY time_entries_select_authenticated ON public.time_entries FOR SELECT TO authenticated USING (true);  -- laesning uaendret
CREATE POLICY time_entries_insert_role ON public.time_entries FOR INSERT TO authenticated WITH CHECK ((public.user_role() IN ('admin')) OR (public.user_role() IN ('serviceleder', 'montør') AND user_id = auth.uid()));
CREATE POLICY time_entries_update_role ON public.time_entries FOR UPDATE TO authenticated USING ((public.user_role() IN ('admin')) OR (public.user_role() IN ('serviceleder', 'montør') AND user_id = auth.uid())) WITH CHECK ((public.user_role() IN ('admin')) OR (public.user_role() IN ('serviceleder', 'montør') AND user_id = auth.uid()));
CREATE POLICY time_entries_delete_role ON public.time_entries FOR DELETE TO authenticated USING ((public.user_role() IN ('admin')) OR (public.user_role() IN ('serviceleder', 'montør') AND user_id = auth.uid()));

-- integrations: integrations-opsaetning (settings.manage). NB: hemmelige kolonner laesbare — laese-opfoelgning (0 raekker i prod)
REVOKE ALL ON public.integrations FROM anon;
DROP POLICY IF EXISTS "authenticated_manage_integrations" ON public.integrations;
DROP POLICY IF EXISTS integrations_insert_role ON public.integrations;
DROP POLICY IF EXISTS integrations_update_role ON public.integrations;
DROP POLICY IF EXISTS integrations_delete_role ON public.integrations;
DROP POLICY IF EXISTS integrations_select_authenticated ON public.integrations;
CREATE POLICY integrations_select_authenticated ON public.integrations FOR SELECT TO authenticated USING (true);  -- laesning uaendret
CREATE POLICY integrations_insert_role ON public.integrations FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin'));
CREATE POLICY integrations_update_role ON public.integrations FOR UPDATE TO authenticated USING (public.user_role() IN ('admin')) WITH CHECK (public.user_role() IN ('admin'));
CREATE POLICY integrations_delete_role ON public.integrations FOR DELETE TO authenticated USING (public.user_role() IN ('admin'));

-- integration_endpoints: integrations-opsaetning (settings.manage)
REVOKE ALL ON public.integration_endpoints FROM anon;
DROP POLICY IF EXISTS "authenticated_manage_integration_endpoints" ON public.integration_endpoints;
DROP POLICY IF EXISTS integration_endpoints_insert_role ON public.integration_endpoints;
DROP POLICY IF EXISTS integration_endpoints_update_role ON public.integration_endpoints;
DROP POLICY IF EXISTS integration_endpoints_delete_role ON public.integration_endpoints;
DROP POLICY IF EXISTS integration_endpoints_select_authenticated ON public.integration_endpoints;
CREATE POLICY integration_endpoints_select_authenticated ON public.integration_endpoints FOR SELECT TO authenticated USING (true);  -- laesning uaendret
CREATE POLICY integration_endpoints_insert_role ON public.integration_endpoints FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin'));
CREATE POLICY integration_endpoints_update_role ON public.integration_endpoints FOR UPDATE TO authenticated USING (public.user_role() IN ('admin')) WITH CHECK (public.user_role() IN ('admin'));
CREATE POLICY integration_endpoints_delete_role ON public.integration_endpoints FOR DELETE TO authenticated USING (public.user_role() IN ('admin'));

-- integration_webhooks: opsaetning admin; taellere opdateres naar tilbud sendes/accepteres (offers.*)
REVOKE ALL ON public.integration_webhooks FROM anon;
DROP POLICY IF EXISTS "authenticated_manage_integration_webhooks" ON public.integration_webhooks;
DROP POLICY IF EXISTS integration_webhooks_insert_role ON public.integration_webhooks;
DROP POLICY IF EXISTS integration_webhooks_update_role ON public.integration_webhooks;
DROP POLICY IF EXISTS integration_webhooks_delete_role ON public.integration_webhooks;
DROP POLICY IF EXISTS integration_webhooks_select_authenticated ON public.integration_webhooks;
CREATE POLICY integration_webhooks_select_authenticated ON public.integration_webhooks FOR SELECT TO authenticated USING (true);  -- laesning uaendret
CREATE POLICY integration_webhooks_insert_role ON public.integration_webhooks FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin'));
CREATE POLICY integration_webhooks_update_role ON public.integration_webhooks FOR UPDATE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder', 'salg')) WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'salg'));
CREATE POLICY integration_webhooks_delete_role ON public.integration_webhooks FOR DELETE TO authenticated USING (public.user_role() IN ('admin'));

-- integration_queue: koe skrives KUN af service-role
REVOKE ALL ON public.integration_queue FROM anon;
DROP POLICY IF EXISTS "authenticated_manage_integration_queue" ON public.integration_queue;
DROP POLICY IF EXISTS integration_queue_insert_role ON public.integration_queue;
DROP POLICY IF EXISTS integration_queue_update_role ON public.integration_queue;
DROP POLICY IF EXISTS integration_queue_delete_role ON public.integration_queue;
DROP POLICY IF EXISTS integration_queue_select_authenticated ON public.integration_queue;
CREATE POLICY integration_queue_select_authenticated ON public.integration_queue FOR SELECT TO authenticated USING (true);  -- laesning uaendret

-- integration_logs: webhook-log fra tilbudsflow (offers.*); aldrig rettet/slettet (append-only)
REVOKE ALL ON public.integration_logs FROM anon;
DROP POLICY IF EXISTS "authenticated_insert_integration_logs" ON public.integration_logs;
DROP POLICY IF EXISTS integration_logs_insert_role ON public.integration_logs;
DROP POLICY IF EXISTS integration_logs_update_role ON public.integration_logs;
DROP POLICY IF EXISTS integration_logs_delete_role ON public.integration_logs;
DROP POLICY IF EXISTS integration_logs_select_authenticated ON public.integration_logs;
CREATE POLICY integration_logs_insert_role ON public.integration_logs FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'salg'));

-- external_references: eksport af tilbud til integration (offers.send)
REVOKE ALL ON public.external_references FROM anon;
DROP POLICY IF EXISTS "authenticated_manage_external_references" ON public.external_references;
DROP POLICY IF EXISTS external_references_insert_role ON public.external_references;
DROP POLICY IF EXISTS external_references_update_role ON public.external_references;
DROP POLICY IF EXISTS external_references_delete_role ON public.external_references;
DROP POLICY IF EXISTS external_references_select_authenticated ON public.external_references;
CREATE POLICY external_references_select_authenticated ON public.external_references FOR SELECT TO authenticated USING (true);  -- laesning uaendret
CREATE POLICY external_references_insert_role ON public.external_references FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'salg'));
CREATE POLICY external_references_update_role ON public.external_references FOR UPDATE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder', 'salg')) WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'salg'));
CREATE POLICY external_references_delete_role ON public.external_references FOR DELETE TO authenticated USING (public.user_role() IN ('admin'));

-- automation_rules: go-live/regler (admin)
REVOKE ALL ON public.automation_rules FROM anon;
DROP POLICY IF EXISTS "automation_rules_all_auth" ON public.automation_rules;
DROP POLICY IF EXISTS automation_rules_insert_role ON public.automation_rules;
DROP POLICY IF EXISTS automation_rules_update_role ON public.automation_rules;
DROP POLICY IF EXISTS automation_rules_delete_role ON public.automation_rules;
DROP POLICY IF EXISTS automation_rules_select_authenticated ON public.automation_rules;
CREATE POLICY automation_rules_select_authenticated ON public.automation_rules FOR SELECT TO authenticated USING (true);  -- laesning uaendret
CREATE POLICY automation_rules_insert_role ON public.automation_rules FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin'));
CREATE POLICY automation_rules_update_role ON public.automation_rules FOR UPDATE TO authenticated USING (public.user_role() IN ('admin')) WITH CHECK (public.user_role() IN ('admin'));
CREATE POLICY automation_rules_delete_role ON public.automation_rules FOR DELETE TO authenticated USING (public.user_role() IN ('admin'));

-- automation_executions: udfoerelseslog skrives KUN af service-role (regelmotor)
REVOKE ALL ON public.automation_executions FROM anon;
DROP POLICY IF EXISTS "automation_executions_all_auth" ON public.automation_executions;
DROP POLICY IF EXISTS automation_executions_insert_role ON public.automation_executions;
DROP POLICY IF EXISTS automation_executions_update_role ON public.automation_executions;
DROP POLICY IF EXISTS automation_executions_delete_role ON public.automation_executions;
DROP POLICY IF EXISTS automation_executions_select_authenticated ON public.automation_executions;
CREATE POLICY automation_executions_select_authenticated ON public.automation_executions FOR SELECT TO authenticated USING (true);  -- laesning uaendret

-- email_templates: mailskabeloner (settings.view)
REVOKE ALL ON public.email_templates FROM anon;
DROP POLICY IF EXISTS "email_templates_insert" ON public.email_templates;
DROP POLICY IF EXISTS "email_templates_update" ON public.email_templates;
DROP POLICY IF EXISTS "email_templates_delete" ON public.email_templates;
DROP POLICY IF EXISTS email_templates_insert_role ON public.email_templates;
DROP POLICY IF EXISTS email_templates_update_role ON public.email_templates;
DROP POLICY IF EXISTS email_templates_delete_role ON public.email_templates;
DROP POLICY IF EXISTS email_templates_select_authenticated ON public.email_templates;
CREATE POLICY email_templates_insert_role ON public.email_templates FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder'));
CREATE POLICY email_templates_update_role ON public.email_templates FOR UPDATE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder')) WITH CHECK (public.user_role() IN ('admin', 'serviceleder'));
CREATE POLICY email_templates_delete_role ON public.email_templates FOR DELETE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder'));

-- sms_templates: SMS-skabeloner skrives KUN af service-role
REVOKE ALL ON public.sms_templates FROM anon;
DROP POLICY IF EXISTS "sms_templates_insert" ON public.sms_templates;
DROP POLICY IF EXISTS "sms_templates_update" ON public.sms_templates;
DROP POLICY IF EXISTS "sms_templates_delete" ON public.sms_templates;
DROP POLICY IF EXISTS sms_templates_insert_role ON public.sms_templates;
DROP POLICY IF EXISTS sms_templates_update_role ON public.sms_templates;
DROP POLICY IF EXISTS sms_templates_delete_role ON public.sms_templates;
DROP POLICY IF EXISTS sms_templates_select_authenticated ON public.sms_templates;

NOTIFY pgrst, 'reload schema';

COMMIT;
