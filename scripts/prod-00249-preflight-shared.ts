/** Delt mellem prod-00249-preflight.ts og prod-00249-dryrun.ts: data-fingeraftryk (antal + md5 af hele rækken) */
const md5 = (t: string, order = 'x.id') => `(SELECT count(*)::int || ':' || md5(coalesce(string_agg(to_jsonb(x)::text, '|' ORDER BY ${order}), '')) FROM public.${t} x)`
export const FP_00249: Array<[string, string]> = [['customers', 'x.id'], ['service_cases', 'x.id'], ['incoming_emails', 'x.id'], ['portal_messages', 'x.id'],
  ['telephony_calls', 'x.id'], ['telephony_events', 'x.id'], ['customer_documents', 'x.id'], ['customer_tasks', 'x.id'], ['customer_contacts', 'x.id'],
  ['profiles', 'x.id'], ['user_permission_overrides', 'x.profile_id, x.permission'], ['permission_catalog', 'x.permission'], ['role_permission_defaults', 'x.role, x.permission']]
export const FP_00249_SQL = `SELECT ${FP_00249.map(([t, o]) => `${md5(t, o)} AS ${t}`).join(', ')}`
