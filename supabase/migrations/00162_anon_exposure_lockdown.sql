-- =====================================================================
-- 00162: Luk anon-eksponering fundet af fuld DB-audit (incident P-004)
-- =====================================================================
-- FUND (prod read-only, npm run prod:db-audit, 2026-09-27)
--   anon = alle paa internettet med den offentlige anon-noegle (ligger i frontend-bundlen).
--   V1  7 views koerte med ejer-rettigheder og var SELECT-bare for anon -> omgik al RLS. Vaerst:
--       v_supplier_products_with_supplier eksponerede 310.308 leverandoerprodukter med indkoebspris
--       (cost_price), avance og salgspris. v_packages_summary / v_kalkia_nodes_summary: kost-/salgspris og DB.
--       v_kalkia_calculations_summary (0 raekker i dag): kundenavn + marginer. v_import_batches_summary: bruger-email.
--   F1  7 SECURITY DEFINER-funktioner kunne kaldes af anon, bl.a. log_audit_event (forfalskning af audit-log)
--       og user_role/user_has_role/user_permissions/user_employee_id (rolle-opslag for vilkaarlige bruger-id'er).
--   T2  4 kataloger laesbare for anon (product_catalog har cost_price-kolonne).
--   T3  3 log-tabeller skrivbare for anon (email_events, sms_events, integration_logs).
--
-- KODEKONTROL: appen bruger ingen af disse flader med anon-klienten. Eneste anon-brug er
-- auth.signInWithPassword (settings.ts). Portal = admin-klient; webhooks/tracking = service-role.
--
-- EFFEKT: anon mister al adgang til fladerne. Indloggede brugere er uaendrede (views koerer nu med brugerens
-- rettigheder = RLS paa de underliggende tabeller; funktioner beholder EXECUTE for authenticated).
--
-- ROLLBACK
--   BEGIN;
--   ALTER VIEW public.v_calc_components_summary RESET (security_invoker);  -- (gentag for alle 7 views)
--   GRANT SELECT ON public.v_calc_components_summary TO anon;              -- (gentag for alle 7 views)
--   GRANT SELECT ON public.package_categories, public.product_catalog, public.product_categories, public.project_templates TO anon;
--   GRANT INSERT ON public.email_events, public.sms_events, public.integration_logs TO anon;
--   CREATE POLICY "email_events_anon_insert" ON public.email_events AS PERMISSIVE FOR INSERT TO anon WITH CHECK (true);
--   CREATE POLICY "sms_events_insert_anon" ON public.sms_events AS PERMISSIVE FOR INSERT TO anon WITH CHECK (true);
--   CREATE POLICY "service_insert_integration_logs" ON public.integration_logs AS PERMISSIVE FOR INSERT TO anon WITH CHECK (true);
--   GRANT EXECUTE ON FUNCTION public.user_role(uuid) TO PUBLIC;             -- (gentag for de 7 funktioner)
--   NOTIFY pgrst, 'reload schema';
--   COMMIT;
--
-- KOER IKKE MOD PRODUCTION uden eksplicit approval. Staging: npm run harness:migrate-staging -- 00162
-- Verifikation: npm run prod:db-audit (read-only) -> 0 HOEJ
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------- V1: views -> brugerens rettigheder, ingen anon
ALTER VIEW public.v_calc_components_summary SET (security_invoker = true);
ALTER VIEW public.v_import_batches_summary SET (security_invoker = true);
ALTER VIEW public.v_kalkia_calculations_summary SET (security_invoker = true);
ALTER VIEW public.v_kalkia_nodes_summary SET (security_invoker = true);
ALTER VIEW public.v_packages_summary SET (security_invoker = true);
ALTER VIEW public.v_supplier_products_with_supplier SET (security_invoker = true);
ALTER VIEW public.v_supplier_sync_jobs SET (security_invoker = true);
REVOKE ALL ON public.v_calc_components_summary, public.v_import_batches_summary, public.v_kalkia_calculations_summary,
  public.v_kalkia_nodes_summary, public.v_packages_summary, public.v_supplier_products_with_supplier,
  public.v_supplier_sync_jobs FROM anon;

-- ---------------------------------------------------------------- T2: kataloger kun for indloggede
-- ("Anyone can view ..."-policies gaelder fortsat authenticated; anon mister grant)
REVOKE SELECT ON public.package_categories, public.product_catalog, public.product_categories, public.project_templates FROM anon;

-- ---------------------------------------------------------------- T3: log-tabeller ikke skrivbare for anon
DROP POLICY IF EXISTS "email_events_anon_insert" ON public.email_events;
DROP POLICY IF EXISTS "sms_events_insert_anon" ON public.sms_events;
DROP POLICY IF EXISTS "service_insert_integration_logs" ON public.integration_logs;
REVOKE INSERT, UPDATE, DELETE ON public.email_events, public.sms_events, public.integration_logs FROM anon;

-- ---------------------------------------------------------------- F1: SECURITY DEFINER-funktioner ikke for anon
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_audit_event(uuid, text, text, text, uuid, text, text, text, jsonb, jsonb, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_employee_id(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_has_permission(text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_has_role(text[], uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_permissions(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_role(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin, service_role;
GRANT EXECUTE ON FUNCTION public.log_audit_event(uuid, text, text, text, uuid, text, text, text, jsonb, jsonb, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_employee_id(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_has_permission(text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_has_role(text[], uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_permissions(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_role(uuid) TO authenticated, service_role;

-- Agent Core approval-helpers: production har dem allerede strammet (00157). Idempotent no-op i prod;
-- lukker paritetshul paa miljoeer bygget fra schema-dump (funktions-ACL'er kom ikke med). Kun service_role (Executor).
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.agent_action_effective_approvals(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.agent_action_is_executable(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_action_effective_approvals(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.agent_action_is_executable(uuid, integer) TO service_role;

-- ---------------------------------------------------------------- F3: laas search_path paa SECURITY DEFINER
ALTER FUNCTION public.handle_new_user() SET search_path = public;
ALTER FUNCTION public.log_audit_event(uuid, text, text, text, uuid, text, text, text, jsonb, jsonb, text, text) SET search_path = public;

NOTIFY pgrst, 'reload schema';

COMMIT;
