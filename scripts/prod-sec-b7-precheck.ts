/**
 * PRODUCTION read-only pre-check for SEC-B7 / forslag 00235 (skrive-lockdown af work_orders, customer_tasks,
 * roof_drawings). Kun antal — ingen indhold, id'er eller personværdier ud. Viser hvor mange EKSISTERENDE rækker der ville
 * stride mod de foreslåede regler (de nye regler gælder kun nye skrivninger, men en UPDATE af en sådan række afvises).
 *   npx tsx scripts/prod-sec-b7-precheck.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

const CHECKS: Array<[string, string]> = [
  ['work_orders i alt', `SELECT count(*)::int n FROM public.work_orders`],
  ['work_orders pr. status', `SELECT coalesce(string_agg(status || '=' || n, ', ' ORDER BY status), '') n FROM (SELECT status::text, count(*)::int n FROM public.work_orders GROUP BY 1) s`],
  ['work_orders tildelt en montør-medarbejder', `SELECT count(*)::int n FROM public.work_orders w JOIN public.employees e ON e.id = w.assigned_employee_id JOIN public.profiles p ON p.id = e.profile_id WHERE p.role::text = 'montør'`],
  ['customer_tasks i alt', `SELECT count(*)::int n FROM public.customer_tasks`],
  ['customer_tasks uden created_by (system/auto)', `SELECT count(*)::int n FROM public.customer_tasks WHERE created_by IS NULL`],
  ['customer_tasks tildelt/oprettet af montør', `SELECT count(*)::int n FROM public.customer_tasks t JOIN public.profiles p ON p.id IN (t.assigned_to, t.created_by) WHERE p.role::text = 'montør'`],
  ['customer_tasks pr. oprettende rolle', `SELECT coalesce(string_agg(r || '=' || n, ', ' ORDER BY r), '') n FROM (SELECT coalesce(p.role::text, '(ingen)') r, count(*)::int n FROM public.customer_tasks t LEFT JOIN public.profiles p ON p.id = t.created_by GROUP BY 1) s`],
  ['roof_drawings i alt', `SELECT count(*)::int n FROM public.roof_drawings`],
  ['roof_drawings uden sag', `SELECT count(*)::int n FROM public.roof_drawings WHERE service_case_id IS NULL`],
  ['roof_drawings hvor sagens kunde ≠ tegningens kunde', `SELECT count(*)::int n FROM public.roof_drawings r JOIN public.service_cases sc ON sc.id = r.service_case_id WHERE sc.customer_id IS DISTINCT FROM r.customer_id`],
  ['roof_drawings pr. oprettende rolle', `SELECT coalesce(string_agg(r || '=' || n, ', ' ORDER BY r), '') n FROM (SELECT coalesce(p.role::text, '(ingen)') r, count(*)::int n FROM public.roof_drawings d LEFT JOIN public.profiles p ON p.id = d.created_by GROUP BY 1) s`],
  ['aktive profiler pr. rolle', `SELECT coalesce(string_agg(r || '=' || n, ', ' ORDER BY r), '') n FROM (SELECT role::text r, count(*)::int n FROM public.profiles WHERE is_active GROUP BY 1) s`],
  ['triggere på de tre tabeller', `SELECT coalesce(string_agg(event_object_table || ':' || trigger_name, ', ' ORDER BY 1), '') n FROM (SELECT DISTINCT event_object_table, trigger_name FROM information_schema.triggers WHERE event_object_schema = 'public' AND event_object_table IN ('work_orders', 'customer_tasks', 'roof_drawings')) t`],
  ['eksisterende funktioner med 00235-navne', `SELECT count(*)::int n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace WHERE ns.nspname = 'public' AND p.proname IN ('work_orders_montor_write_guard', 'montor_has_customer_job', 'customer_tasks_created_by_guard')`],
]

withProdReadOnly('prod-sec-b7-precheck', async (run, masked) => {
  console.log(`--- SEC-B7 / 00235 pre-check @ prod:${masked} (kun antal) ---`)
  for (const [label, sql] of CHECKS) {
    const v = (await run(sql))[0]?.n
    console.log(`  ${label}: ${v}`)
  }
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
