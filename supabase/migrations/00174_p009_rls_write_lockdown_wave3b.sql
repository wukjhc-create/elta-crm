-- =====================================================================
-- 00174 — P-009 RLS-skrivelås, WAVE3B (email_messages, email_threads, email_events, sms_messages, sms_events, graph_sync_state, email_intelligence_logs, email_intelligence_daily_summary, ai_suggestions, ai_usage_daily, ai_prompt_templates)
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

-- email_messages: udgaaende tilbuds-/opgavemails (offers.send, tasks.edit)
REVOKE ALL ON public.email_messages FROM anon;
DROP POLICY IF EXISTS "email_messages_insert" ON public.email_messages;
DROP POLICY IF EXISTS "email_messages_update" ON public.email_messages;
DROP POLICY IF EXISTS email_messages_insert_role ON public.email_messages;
DROP POLICY IF EXISTS email_messages_update_role ON public.email_messages;
DROP POLICY IF EXISTS email_messages_delete_role ON public.email_messages;
DROP POLICY IF EXISTS email_messages_select_authenticated ON public.email_messages;
CREATE POLICY email_messages_insert_role ON public.email_messages FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'salg', 'montør'));
CREATE POLICY email_messages_update_role ON public.email_messages FOR UPDATE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder', 'salg', 'montør')) WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'salg', 'montør'));

-- email_threads: mailtraade (offers.send, tasks.edit)
REVOKE ALL ON public.email_threads FROM anon;
DROP POLICY IF EXISTS "email_threads_insert" ON public.email_threads;
DROP POLICY IF EXISTS "email_threads_update" ON public.email_threads;
DROP POLICY IF EXISTS email_threads_insert_role ON public.email_threads;
DROP POLICY IF EXISTS email_threads_update_role ON public.email_threads;
DROP POLICY IF EXISTS email_threads_delete_role ON public.email_threads;
DROP POLICY IF EXISTS email_threads_select_authenticated ON public.email_threads;
CREATE POLICY email_threads_insert_role ON public.email_threads FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'salg', 'montør'));
CREATE POLICY email_threads_update_role ON public.email_threads FOR UPDATE TO authenticated USING (public.user_role() IN ('admin', 'serviceleder', 'montør')) WITH CHECK (public.user_role() IN ('admin', 'serviceleder', 'montør'));
ALTER FUNCTION public.update_thread_on_message_status() SECURITY DEFINER SET search_path = public, pg_temp;
ALTER FUNCTION public.update_thread_stats() SECURITY DEFINER SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.update_thread_on_message_status() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_thread_stats() FROM PUBLIC, anon, authenticated;

-- email_events: aabnings-/klik-events skrives KUN af tracking-ruten (service-role)
REVOKE ALL ON public.email_events FROM anon;
DROP POLICY IF EXISTS "email_events_insert" ON public.email_events;
DROP POLICY IF EXISTS email_events_insert_role ON public.email_events;
DROP POLICY IF EXISTS email_events_update_role ON public.email_events;
DROP POLICY IF EXISTS email_events_delete_role ON public.email_events;
DROP POLICY IF EXISTS email_events_select_authenticated ON public.email_events;

-- sms_messages: SMS skrives KUN af service-role
REVOKE ALL ON public.sms_messages FROM anon;
DROP POLICY IF EXISTS "sms_messages_insert" ON public.sms_messages;
DROP POLICY IF EXISTS "sms_messages_update" ON public.sms_messages;
DROP POLICY IF EXISTS sms_messages_insert_role ON public.sms_messages;
DROP POLICY IF EXISTS sms_messages_update_role ON public.sms_messages;
DROP POLICY IF EXISTS sms_messages_delete_role ON public.sms_messages;
DROP POLICY IF EXISTS sms_messages_select_authenticated ON public.sms_messages;

-- sms_events: SMS-events skrives KUN af service-role
REVOKE ALL ON public.sms_events FROM anon;
DROP POLICY IF EXISTS "sms_events_insert_authenticated" ON public.sms_events;
DROP POLICY IF EXISTS sms_events_insert_role ON public.sms_events;
DROP POLICY IF EXISTS sms_events_update_role ON public.sms_events;
DROP POLICY IF EXISTS sms_events_delete_role ON public.sms_events;
DROP POLICY IF EXISTS sms_events_select_authenticated ON public.sms_events;

-- graph_sync_state: mail-synk delta-links (settings.manage); cron-synk med service-role
REVOKE ALL ON public.graph_sync_state FROM anon;
DROP POLICY IF EXISTS "graph_sync_state_insert" ON public.graph_sync_state;
DROP POLICY IF EXISTS "graph_sync_state_update" ON public.graph_sync_state;
DROP POLICY IF EXISTS graph_sync_state_insert_role ON public.graph_sync_state;
DROP POLICY IF EXISTS graph_sync_state_update_role ON public.graph_sync_state;
DROP POLICY IF EXISTS graph_sync_state_delete_role ON public.graph_sync_state;
DROP POLICY IF EXISTS graph_sync_state_select_authenticated ON public.graph_sync_state;
CREATE POLICY graph_sync_state_insert_role ON public.graph_sync_state FOR INSERT TO authenticated WITH CHECK (public.user_role() IN ('admin'));
CREATE POLICY graph_sync_state_update_role ON public.graph_sync_state FOR UPDATE TO authenticated USING (public.user_role() IN ('admin')) WITH CHECK (public.user_role() IN ('admin'));
CREATE POLICY graph_sync_state_delete_role ON public.graph_sync_state FOR DELETE TO authenticated USING (public.user_role() IN ('admin'));

-- email_intelligence_logs: mail-intelligens-log (service-role)
REVOKE ALL ON public.email_intelligence_logs FROM anon;
DROP POLICY IF EXISTS "eil_insert" ON public.email_intelligence_logs;
DROP POLICY IF EXISTS email_intelligence_logs_insert_role ON public.email_intelligence_logs;
DROP POLICY IF EXISTS email_intelligence_logs_update_role ON public.email_intelligence_logs;
DROP POLICY IF EXISTS email_intelligence_logs_delete_role ON public.email_intelligence_logs;
DROP POLICY IF EXISTS email_intelligence_logs_select_authenticated ON public.email_intelligence_logs;

-- email_intelligence_daily_summary: daglig opsummering (service-role)
REVOKE ALL ON public.email_intelligence_daily_summary FROM anon;
DROP POLICY IF EXISTS "eids_insert" ON public.email_intelligence_daily_summary;
DROP POLICY IF EXISTS "eids_update" ON public.email_intelligence_daily_summary;
DROP POLICY IF EXISTS email_intelligence_daily_summary_insert_role ON public.email_intelligence_daily_summary;
DROP POLICY IF EXISTS email_intelligence_daily_summary_update_role ON public.email_intelligence_daily_summary;
DROP POLICY IF EXISTS email_intelligence_daily_summary_delete_role ON public.email_intelligence_daily_summary;
DROP POLICY IF EXISTS email_intelligence_daily_summary_select_authenticated ON public.email_intelligence_daily_summary;

-- ai_suggestions: AI-forslag (service-role)
REVOKE ALL ON public.ai_suggestions FROM anon;
DROP POLICY IF EXISTS "ai_suggestions_all_auth" ON public.ai_suggestions;
DROP POLICY IF EXISTS ai_suggestions_insert_role ON public.ai_suggestions;
DROP POLICY IF EXISTS ai_suggestions_update_role ON public.ai_suggestions;
DROP POLICY IF EXISTS ai_suggestions_delete_role ON public.ai_suggestions;
DROP POLICY IF EXISTS ai_suggestions_select_authenticated ON public.ai_suggestions;
CREATE POLICY ai_suggestions_select_authenticated ON public.ai_suggestions FOR SELECT TO authenticated USING (true);  -- laesning uaendret

-- ai_usage_daily: AI-forbrugstaeller/budgetloft — maa ikke kunne nulstilles via REST (service-role)
REVOKE ALL ON public.ai_usage_daily FROM anon;
DROP POLICY IF EXISTS "ai_usage_insert" ON public.ai_usage_daily;
DROP POLICY IF EXISTS "ai_usage_update" ON public.ai_usage_daily;
DROP POLICY IF EXISTS ai_usage_daily_insert_role ON public.ai_usage_daily;
DROP POLICY IF EXISTS ai_usage_daily_update_role ON public.ai_usage_daily;
DROP POLICY IF EXISTS ai_usage_daily_delete_role ON public.ai_usage_daily;
DROP POLICY IF EXISTS ai_usage_daily_select_authenticated ON public.ai_usage_daily;

-- ai_prompt_templates: AI-promptskabeloner (service-role/migrationer) — prompt-injektion via REST lukket
REVOKE ALL ON public.ai_prompt_templates FROM anon;
DROP POLICY IF EXISTS "ai_prompt_templates_insert" ON public.ai_prompt_templates;
DROP POLICY IF EXISTS "ai_prompt_templates_update" ON public.ai_prompt_templates;
DROP POLICY IF EXISTS ai_prompt_templates_insert_role ON public.ai_prompt_templates;
DROP POLICY IF EXISTS ai_prompt_templates_update_role ON public.ai_prompt_templates;
DROP POLICY IF EXISTS ai_prompt_templates_delete_role ON public.ai_prompt_templates;
DROP POLICY IF EXISTS ai_prompt_templates_select_authenticated ON public.ai_prompt_templates;

NOTIFY pgrst, 'reload schema';

COMMIT;
