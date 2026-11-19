/**
 * 00252 (customer_tasks.customer_visible) — delt mellem prod-00252-preflight.ts og prod-00252-dryrun.ts.
 * Data-fingeraftryk = "antal:md5" af hele rækken; customer_visible trækkes fra (jsonb - nøgle er en no-op før anvendelse),
 * så fingeraftrykket måler om EKSISTERENDE værdier er uændrede. Ingen personværdier ud.
 */
const md5 = (t: string, order = 'x.id') => `(SELECT count(*)::int || ':' || md5(coalesce(string_agg((to_jsonb(x) - 'customer_visible')::text, '|' ORDER BY ${order}), '')) FROM public.${t} x)`
export const FP_00252: Array<[string, string]> = [['customer_tasks', 'x.id'], ['customers', 'x.id'], ['service_cases', 'x.id'], ['offers', 'x.id'],
  ['offer_line_items', 'x.id'], ['offer_signatures', 'x.id'], ['customer_documents', 'x.id'], ['portal_messages', 'x.id'], ['portal_access_tokens', 'x.id'],
  ['invoices', 'x.id'], ['profiles', 'x.id'], ['user_permission_overrides', 'x.profile_id, x.permission'], ['permission_catalog', 'x.permission'],
  ['role_permission_defaults', 'x.role, x.permission'], ['conversations', 'x.id'], ['conversation_items', 'x.id'], ['conversation_actions', 'x.id']]
export const FP_00252_SQL = `SELECT ${FP_00252.map(([t, o]) => `${md5(t, o)} AS ${t}`).join(', ')}`

/** Den GAMLE portalregel (prod-kode 4487efd2): titel "Besigtigelse hos …" uden auto_rule ELLER "PORTAL: Besigtigelse …" */
export const OLD_RULE = `((t.auto_rule IS NULL AND btrim(t.title) ~* '^besigtigelse hos ') OR btrim(t.title) ~* '^portal:\\s*besigtigelse')`
export const PORTAL_CUSTOMERS = `(SELECT DISTINCT customer_id FROM public.portal_access_tokens WHERE is_active AND (expires_at IS NULL OR expires_at > now()))`

/** RLS/grants på customer_tasks + funktionsliste — skal være uændret af 00252 (kun ny kolonne + værn) */
export const TASK_SECURITY_SQL = `SELECT
  (SELECT md5(coalesce(string_agg(policyname || ':' || cmd || ':' || roles::text || ':' || coalesce(qual, '') || ':' || coalesce(with_check, ''), '|' ORDER BY policyname), '')) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'customer_tasks') pol,
  (SELECT md5(coalesce(string_agg(grantee || ':' || privilege_type, '|' ORDER BY grantee, privilege_type), '')) FROM information_schema.role_table_grants WHERE table_schema = 'public' AND table_name = 'customer_tasks') grants,
  (SELECT relrowsecurity::text FROM pg_class WHERE oid = 'public.customer_tasks'::regclass) rls,
  (SELECT md5(coalesce(string_agg(tgname || ':' || tgenabled::text, '|' ORDER BY tgname), '')) FROM pg_trigger WHERE NOT tgisinternal AND tgrelid = 'public.customer_tasks'::regclass AND tgname <> 'trg_customer_tasks_visibility_guard') other_triggers`
