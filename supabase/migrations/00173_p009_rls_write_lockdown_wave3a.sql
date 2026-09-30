-- =====================================================================
-- 00173 — P-009 RLS-skrivelås, WAVE3A (service_cases, case_notes, case_materials, case_other_costs, customer_tasks, document_confirmations, roof_drawings, service_case_attachments, projects, project_tasks, quick_jobs, leads, lead_activities, messages, sent_quotes, offer_signatures, offer_packages, offer_package_items, offer_text_templates, offer_generation_log, partner_access_tokens)
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

-- service_cases: opret: cases.create + opret-fra-mail (inbox.view) · ret: cases.edit/close + sag-fra-tilbud/mail (cases.create) · slet: cases.delete + afvis forslag
REVOKE ALL ON public.service_cases FROM anon;
DROP POLICY IF EXISTS "Authenticated users can create service cases" ON public.service_cases;
DROP POLICY IF EXISTS "Authenticated users can update service cases" ON public.service_cases;
DROP POLICY IF EXISTS "Authenticated users can delete service cases" ON public.service_cases;
DROP POLICY IF EXISTS service_cases_insert_role ON public.service_cases;
DROP POLICY IF EXISTS service_cases_update_role ON public.service_cases;
DROP POLICY IF EXISTS service_cases_delete_role ON public.service_cases;
DROP POLICY IF EXISTS service_cases_select_authenticated ON public.service_cases;
CREATE POLICY service_cases_insert_role ON public.service_cases FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'salg', 'montør'));
CREATE POLICY service_cases_update_role ON public.service_cases FOR UPDATE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder', 'salg')) WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'salg'));
CREATE POLICY service_cases_delete_role ON public.service_cases FOR DELETE TO authenticated USING ((public.user_role() IN ('admin')) OR (public.user_role() IN ('serviceleder', 'salg') AND is_proposal = true));

-- case_notes: cases.edit = alle noter; cases.edit.own = kun egne (app tjekker desuden sagsadgang)
REVOKE ALL ON public.case_notes FROM anon;
DROP POLICY IF EXISTS "case_notes_insert" ON public.case_notes;
DROP POLICY IF EXISTS "case_notes_update" ON public.case_notes;
DROP POLICY IF EXISTS "case_notes_delete" ON public.case_notes;
DROP POLICY IF EXISTS case_notes_insert_role ON public.case_notes;
DROP POLICY IF EXISTS case_notes_update_role ON public.case_notes;
DROP POLICY IF EXISTS case_notes_delete_role ON public.case_notes;
DROP POLICY IF EXISTS case_notes_select_authenticated ON public.case_notes;
CREATE POLICY case_notes_insert_role ON public.case_notes FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'salg', 'montør'));
CREATE POLICY case_notes_update_role ON public.case_notes FOR UPDATE TO authenticated USING ((public.user_role() IN ('admin', 'serviceleder')) OR (public.user_role() IN ('montør') AND created_by = auth.uid())) WITH CHECK ((public.user_role() IN ('admin', 'serviceleder')) OR (public.user_role() IN ('montør') AND created_by = auth.uid()));
CREATE POLICY case_notes_delete_role ON public.case_notes FOR DELETE TO authenticated USING ((public.user_role() IN ('admin', 'serviceleder')) OR (public.user_role() IN ('montør') AND created_by = auth.uid()));

-- case_materials: materialer paa sag/arbejdsordre (cases.edit, work_orders.complete)
REVOKE ALL ON public.case_materials FROM anon;
DROP POLICY IF EXISTS "case_materials_all_auth" ON public.case_materials;
DROP POLICY IF EXISTS case_materials_insert_role ON public.case_materials;
DROP POLICY IF EXISTS case_materials_update_role ON public.case_materials;
DROP POLICY IF EXISTS case_materials_delete_role ON public.case_materials;
DROP POLICY IF EXISTS case_materials_select_authenticated ON public.case_materials;
CREATE POLICY case_materials_select_authenticated ON public.case_materials FOR SELECT TO authenticated USING (true);  -- laesning uaendret
CREATE POLICY case_materials_insert_role ON public.case_materials FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'montør'));
CREATE POLICY case_materials_update_role ON public.case_materials FOR UPDATE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder')) WITH CHECK (public.user_role() IN ('admin', 'serviceleder'));
CREATE POLICY case_materials_delete_role ON public.case_materials FOR DELETE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder'));

-- case_other_costs: oevrige omkostninger paa sag (cases.edit, work_orders.complete)
REVOKE ALL ON public.case_other_costs FROM anon;
DROP POLICY IF EXISTS "case_other_costs_all_auth" ON public.case_other_costs;
DROP POLICY IF EXISTS case_other_costs_insert_role ON public.case_other_costs;
DROP POLICY IF EXISTS case_other_costs_update_role ON public.case_other_costs;
DROP POLICY IF EXISTS case_other_costs_delete_role ON public.case_other_costs;
DROP POLICY IF EXISTS case_other_costs_select_authenticated ON public.case_other_costs;
CREATE POLICY case_other_costs_select_authenticated ON public.case_other_costs FOR SELECT TO authenticated USING (true);  -- laesning uaendret
CREATE POLICY case_other_costs_insert_role ON public.case_other_costs FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'montør'));
CREATE POLICY case_other_costs_update_role ON public.case_other_costs FOR UPDATE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder')) WITH CHECK (public.user_role() IN ('admin', 'serviceleder'));
CREATE POLICY case_other_costs_delete_role ON public.case_other_costs FOR DELETE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder'));

-- customer_tasks: kundeopgaver oprettes/lukkes fra alle moduler (customers.view m.fl.); kun kendte roller
-- anon-grants BEVARES midlertidigt: anon-cron (P-003, rettelse afventer Henrik) — revoke ville skifte tom laesning til fejl (RLS blokerer stadig al anon-skrivning — ingen anon-policies)
DROP POLICY IF EXISTS "Authenticated users can manage customer tasks" ON public.customer_tasks;
DROP POLICY IF EXISTS customer_tasks_insert_role ON public.customer_tasks;
DROP POLICY IF EXISTS customer_tasks_update_role ON public.customer_tasks;
DROP POLICY IF EXISTS customer_tasks_delete_role ON public.customer_tasks;
DROP POLICY IF EXISTS customer_tasks_select_authenticated ON public.customer_tasks;
CREATE POLICY customer_tasks_select_authenticated ON public.customer_tasks FOR SELECT TO authenticated USING (true);  -- laesning uaendret
CREATE POLICY customer_tasks_insert_role ON public.customer_tasks FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'montør', 'salg', 'bogholderi'));
CREATE POLICY customer_tasks_update_role ON public.customer_tasks FOR UPDATE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder', 'montør', 'salg', 'bogholderi')) WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'montør', 'salg', 'bogholderi'));
CREATE POLICY customer_tasks_delete_role ON public.customer_tasks FOR DELETE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder', 'montør', 'salg', 'bogholderi'));

-- document_confirmations: bekraeftelses-anmodninger (service.edit); kundens svar sker med service-role
REVOKE ALL ON public.document_confirmations FROM anon;
DROP POLICY IF EXISTS "Authenticated full access" ON public.document_confirmations;
DROP POLICY IF EXISTS document_confirmations_insert_role ON public.document_confirmations;
DROP POLICY IF EXISTS document_confirmations_update_role ON public.document_confirmations;
DROP POLICY IF EXISTS document_confirmations_delete_role ON public.document_confirmations;
DROP POLICY IF EXISTS document_confirmations_select_authenticated ON public.document_confirmations;
CREATE POLICY document_confirmations_select_authenticated ON public.document_confirmations FOR SELECT TO authenticated USING (true);  -- laesning uaendret
CREATE POLICY document_confirmations_insert_role ON public.document_confirmations FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'montør'));
CREATE POLICY document_confirmations_update_role ON public.document_confirmations FOR UPDATE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder', 'montør')) WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'montør'));

-- roof_drawings: tagtegninger paa kundekortet (customers.view = alle roller)
REVOKE ALL ON public.roof_drawings FROM anon;
DROP POLICY IF EXISTS "Authenticated manage roof drawings" ON public.roof_drawings;
DROP POLICY IF EXISTS roof_drawings_insert_role ON public.roof_drawings;
DROP POLICY IF EXISTS roof_drawings_update_role ON public.roof_drawings;
DROP POLICY IF EXISTS roof_drawings_delete_role ON public.roof_drawings;
DROP POLICY IF EXISTS roof_drawings_select_authenticated ON public.roof_drawings;
CREATE POLICY roof_drawings_select_authenticated ON public.roof_drawings FOR SELECT TO authenticated USING (true);  -- laesning uaendret
CREATE POLICY roof_drawings_insert_role ON public.roof_drawings FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'montør', 'salg', 'bogholderi'));
CREATE POLICY roof_drawings_update_role ON public.roof_drawings FOR UPDATE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder', 'montør', 'salg', 'bogholderi')) WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'montør', 'salg', 'bogholderi'));
CREATE POLICY roof_drawings_delete_role ON public.roof_drawings FOR DELETE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder', 'montør', 'salg', 'bogholderi'));

-- service_case_attachments: sagsbilag (cases.edit)
REVOKE ALL ON public.service_case_attachments FROM anon;
DROP POLICY IF EXISTS "Auth users manage service case attachments" ON public.service_case_attachments;
DROP POLICY IF EXISTS service_case_attachments_insert_role ON public.service_case_attachments;
DROP POLICY IF EXISTS service_case_attachments_update_role ON public.service_case_attachments;
DROP POLICY IF EXISTS service_case_attachments_delete_role ON public.service_case_attachments;
DROP POLICY IF EXISTS service_case_attachments_select_authenticated ON public.service_case_attachments;
CREATE POLICY service_case_attachments_select_authenticated ON public.service_case_attachments FOR SELECT TO authenticated USING (true);  -- laesning uaendret
CREATE POLICY service_case_attachments_insert_role ON public.service_case_attachments FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder'));
CREATE POLICY service_case_attachments_delete_role ON public.service_case_attachments FOR DELETE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder'));

-- projects: projects.create/edit/delete
-- anon-grants BEVARES midlertidigt: anon-cron (P-003, rettelse afventer Henrik) — revoke ville skifte tom laesning til fejl (RLS blokerer stadig al anon-skrivning — ingen anon-policies)
DROP POLICY IF EXISTS "Users can create projects" ON public.projects;
DROP POLICY IF EXISTS "Users can update projects" ON public.projects;
DROP POLICY IF EXISTS "Users can delete projects" ON public.projects;
DROP POLICY IF EXISTS projects_insert_role ON public.projects;
DROP POLICY IF EXISTS projects_update_role ON public.projects;
DROP POLICY IF EXISTS projects_delete_role ON public.projects;
DROP POLICY IF EXISTS projects_select_authenticated ON public.projects;
CREATE POLICY projects_insert_role ON public.projects FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder'));
CREATE POLICY projects_update_role ON public.projects FOR UPDATE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder')) WITH CHECK (public.user_role() IN ('admin', 'serviceleder'));
CREATE POLICY projects_delete_role ON public.projects FOR DELETE TO authenticated USING (public.user_role() IN ('admin'));
ALTER FUNCTION public.update_project_actual_hours() SECURITY DEFINER SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.update_project_actual_hours() FROM PUBLIC, anon, authenticated;

-- project_tasks: tasks.create/edit (montør retter egne opgaver) · tasks.delete
REVOKE ALL ON public.project_tasks FROM anon;
DROP POLICY IF EXISTS "Users can manage project tasks" ON public.project_tasks;
DROP POLICY IF EXISTS project_tasks_insert_role ON public.project_tasks;
DROP POLICY IF EXISTS project_tasks_update_role ON public.project_tasks;
DROP POLICY IF EXISTS project_tasks_delete_role ON public.project_tasks;
DROP POLICY IF EXISTS project_tasks_select_authenticated ON public.project_tasks;
CREATE POLICY project_tasks_select_authenticated ON public.project_tasks FOR SELECT TO authenticated USING (true);  -- laesning uaendret
CREATE POLICY project_tasks_insert_role ON public.project_tasks FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'montør'));
CREATE POLICY project_tasks_update_role ON public.project_tasks FOR UPDATE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder', 'montør')) WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'montør'));
CREATE POLICY project_tasks_delete_role ON public.project_tasks FOR DELETE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder'));

-- quick_jobs: hurtigjob-katalog: kun statistik-opdatering fra tilbudsflow; oprettes af system
REVOKE ALL ON public.quick_jobs FROM anon;
DROP POLICY IF EXISTS "quick_jobs_insert" ON public.quick_jobs;
DROP POLICY IF EXISTS "quick_jobs_update" ON public.quick_jobs;
DROP POLICY IF EXISTS quick_jobs_insert_role ON public.quick_jobs;
DROP POLICY IF EXISTS quick_jobs_update_role ON public.quick_jobs;
DROP POLICY IF EXISTS quick_jobs_delete_role ON public.quick_jobs;
DROP POLICY IF EXISTS quick_jobs_select_authenticated ON public.quick_jobs;
CREATE POLICY quick_jobs_update_role ON public.quick_jobs FOR UPDATE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder', 'salg')) WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'salg'));

-- leads: leads.create/edit + lead fra mail (inbox.view) · leads.delete
REVOKE ALL ON public.leads FROM anon;
DROP POLICY IF EXISTS "Users can create leads" ON public.leads;
DROP POLICY IF EXISTS "Users can update leads" ON public.leads;
DROP POLICY IF EXISTS "Users can delete leads" ON public.leads;
DROP POLICY IF EXISTS leads_insert_role ON public.leads;
DROP POLICY IF EXISTS leads_update_role ON public.leads;
DROP POLICY IF EXISTS leads_delete_role ON public.leads;
DROP POLICY IF EXISTS leads_select_authenticated ON public.leads;
CREATE POLICY leads_insert_role ON public.leads FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'salg', 'montør') AND created_by = auth.uid());
CREATE POLICY leads_update_role ON public.leads FOR UPDATE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder', 'salg', 'montør')) WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'salg', 'montør'));
CREATE POLICY leads_delete_role ON public.leads FOR DELETE TO authenticated USING (public.user_role() IN ('admin'));

-- lead_activities: aktivitetslog (append-only)
REVOKE ALL ON public.lead_activities FROM anon;
DROP POLICY IF EXISTS "Users can create lead activities" ON public.lead_activities;
DROP POLICY IF EXISTS lead_activities_insert_role ON public.lead_activities;
DROP POLICY IF EXISTS lead_activities_update_role ON public.lead_activities;
DROP POLICY IF EXISTS lead_activities_delete_role ON public.lead_activities;
DROP POLICY IF EXISTS lead_activities_select_authenticated ON public.lead_activities;
CREATE POLICY lead_activities_insert_role ON public.lead_activities FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'salg', 'montør'));

-- messages: interne beskeder: egne (DELETE var aaben for alle — nu kun modtager, som appen)
REVOKE ALL ON public.messages FROM anon;
DROP POLICY IF EXISTS "Users can send messages" ON public.messages;
DROP POLICY IF EXISTS "Users can update messages" ON public.messages;
DROP POLICY IF EXISTS "Users can delete messages" ON public.messages;
DROP POLICY IF EXISTS messages_insert_role ON public.messages;
DROP POLICY IF EXISTS messages_update_role ON public.messages;
DROP POLICY IF EXISTS messages_delete_role ON public.messages;
DROP POLICY IF EXISTS messages_select_authenticated ON public.messages;
CREATE POLICY messages_insert_role ON public.messages FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'montør', 'salg', 'bogholderi') AND from_user_id = auth.uid());
CREATE POLICY messages_update_role ON public.messages FOR UPDATE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder', 'montør', 'salg', 'bogholderi') AND to_user_id = auth.uid()) WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'montør', 'salg', 'bogholderi') AND to_user_id = auth.uid());
CREATE POLICY messages_delete_role ON public.messages FOR DELETE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder', 'montør', 'salg', 'bogholderi') AND to_user_id = auth.uid());

-- sent_quotes: sendte tilbuds-PDF'er registreres KUN af service-role
REVOKE ALL ON public.sent_quotes FROM anon;
DROP POLICY IF EXISTS "Authenticated users can insert sent quotes" ON public.sent_quotes;
DROP POLICY IF EXISTS "auth_insert_sent_quotes" ON public.sent_quotes;
DROP POLICY IF EXISTS sent_quotes_insert_role ON public.sent_quotes;
DROP POLICY IF EXISTS sent_quotes_update_role ON public.sent_quotes;
DROP POLICY IF EXISTS sent_quotes_delete_role ON public.sent_quotes;
DROP POLICY IF EXISTS sent_quotes_select_authenticated ON public.sent_quotes;

-- offer_signatures: digitale underskrifter oprettes KUN via portal (service-role) — medarbejdere maa ikke kunne forfalske en underskrift via REST
REVOKE ALL ON public.offer_signatures FROM anon;
DROP POLICY IF EXISTS "Authenticated can create signatures" ON public.offer_signatures;
DROP POLICY IF EXISTS offer_signatures_insert_role ON public.offer_signatures;
DROP POLICY IF EXISTS offer_signatures_update_role ON public.offer_signatures;
DROP POLICY IF EXISTS offer_signatures_delete_role ON public.offer_signatures;
DROP POLICY IF EXISTS offer_signatures_select_authenticated ON public.offer_signatures;

-- offer_packages: tilbudspakker (admin)
REVOKE ALL ON public.offer_packages FROM anon;
DROP POLICY IF EXISTS "offer_packages_insert" ON public.offer_packages;
DROP POLICY IF EXISTS "offer_packages_update" ON public.offer_packages;
DROP POLICY IF EXISTS "offer_packages_delete" ON public.offer_packages;
DROP POLICY IF EXISTS offer_packages_insert_role ON public.offer_packages;
DROP POLICY IF EXISTS offer_packages_update_role ON public.offer_packages;
DROP POLICY IF EXISTS offer_packages_delete_role ON public.offer_packages;
DROP POLICY IF EXISTS offer_packages_select_authenticated ON public.offer_packages;
CREATE POLICY offer_packages_insert_role ON public.offer_packages FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin'));
CREATE POLICY offer_packages_update_role ON public.offer_packages FOR UPDATE TO authenticated USING (public.user_role() IN ('admin')) WITH CHECK (public.user_role() IN ('admin'));
CREATE POLICY offer_packages_delete_role ON public.offer_packages FOR DELETE TO authenticated USING (public.user_role() IN ('admin'));

-- offer_package_items: pakkelinjer skrives KUN af service-role
REVOKE ALL ON public.offer_package_items FROM anon;
DROP POLICY IF EXISTS "offer_package_items_insert" ON public.offer_package_items;
DROP POLICY IF EXISTS "offer_package_items_update" ON public.offer_package_items;
DROP POLICY IF EXISTS "offer_package_items_delete" ON public.offer_package_items;
DROP POLICY IF EXISTS offer_package_items_insert_role ON public.offer_package_items;
DROP POLICY IF EXISTS offer_package_items_update_role ON public.offer_package_items;
DROP POLICY IF EXISTS offer_package_items_delete_role ON public.offer_package_items;
DROP POLICY IF EXISTS offer_package_items_select_authenticated ON public.offer_package_items;

-- offer_text_templates: tilbudstekster (settings.view)
REVOKE ALL ON public.offer_text_templates FROM anon;
DROP POLICY IF EXISTS "Users can manage templates" ON public.offer_text_templates;
DROP POLICY IF EXISTS "offer_text_templates_modify" ON public.offer_text_templates;
DROP POLICY IF EXISTS offer_text_templates_insert_role ON public.offer_text_templates;
DROP POLICY IF EXISTS offer_text_templates_update_role ON public.offer_text_templates;
DROP POLICY IF EXISTS offer_text_templates_delete_role ON public.offer_text_templates;
DROP POLICY IF EXISTS offer_text_templates_select_authenticated ON public.offer_text_templates;
CREATE POLICY offer_text_templates_select_authenticated ON public.offer_text_templates FOR SELECT TO authenticated USING (true);  -- laesning uaendret
CREATE POLICY offer_text_templates_insert_role ON public.offer_text_templates FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder'));
CREATE POLICY offer_text_templates_update_role ON public.offer_text_templates FOR UPDATE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder')) WITH CHECK (public.user_role() IN ('admin', 'serviceleder'));

-- offer_generation_log: AI-tilbudslog (append-only)
REVOKE ALL ON public.offer_generation_log FROM anon;
DROP POLICY IF EXISTS "offer_generation_log_insert" ON public.offer_generation_log;
DROP POLICY IF EXISTS "offer_generation_log_update" ON public.offer_generation_log;
DROP POLICY IF EXISTS "offer_generation_log_delete" ON public.offer_generation_log;
DROP POLICY IF EXISTS offer_generation_log_insert_role ON public.offer_generation_log;
DROP POLICY IF EXISTS offer_generation_log_update_role ON public.offer_generation_log;
DROP POLICY IF EXISTS offer_generation_log_delete_role ON public.offer_generation_log;
DROP POLICY IF EXISTS offer_generation_log_select_authenticated ON public.offer_generation_log;
CREATE POLICY offer_generation_log_insert_role ON public.offer_generation_log FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'salg'));

-- partner_access_tokens: partnerportal-adgang (settings.manage); validering med service-role. NB: laesning af tokens er aaben — laese-opfoelgning
REVOKE ALL ON public.partner_access_tokens FROM anon;
DROP POLICY IF EXISTS "Authenticated users can manage partner tokens" ON public.partner_access_tokens;
DROP POLICY IF EXISTS partner_access_tokens_insert_role ON public.partner_access_tokens;
DROP POLICY IF EXISTS partner_access_tokens_update_role ON public.partner_access_tokens;
DROP POLICY IF EXISTS partner_access_tokens_delete_role ON public.partner_access_tokens;
DROP POLICY IF EXISTS partner_access_tokens_select_authenticated ON public.partner_access_tokens;
CREATE POLICY partner_access_tokens_select_authenticated ON public.partner_access_tokens FOR SELECT TO authenticated USING (true);  -- laesning uaendret
CREATE POLICY partner_access_tokens_insert_role ON public.partner_access_tokens FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin'));
CREATE POLICY partner_access_tokens_update_role ON public.partner_access_tokens FOR UPDATE TO authenticated USING (public.user_role() IN ('admin')) WITH CHECK (public.user_role() IN ('admin'));

NOTIFY pgrst, 'reload schema';

COMMIT;
