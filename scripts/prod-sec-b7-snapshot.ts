/**
 * PRODUCTION read-only snapshot for 00235 (SEC-B7): politikker, grants, triggere, funktions-hash/ACL og række-antal +
 * række-checksummer (md5 — intet indhold, ingen id'er) for work_orders, customer_tasks, roof_drawings. JSON på stdout.
 *   npx tsx scripts/prod-sec-b7-snapshot.ts > før.json   (og efter) — sammenlign
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

const TABLES = ['work_orders', 'customer_tasks', 'roof_drawings']
const IN = TABLES.map((t) => `'${t}'`).join(',')

withProdReadOnly('prod-sec-b7-snapshot', async (run, masked) => {
  const snap: Record<string, unknown> = { target: `prod:${masked}` }
  snap.policies = await run(`SELECT tablename, policyname, cmd, roles::text roles, coalesce(qual,'') qual, coalesce(with_check,'') with_check FROM pg_policies WHERE schemaname='public' AND tablename IN (${IN}) ORDER BY tablename, cmd, policyname`)
  snap.grants = await run(`SELECT table_name, grantee, string_agg(privilege_type, ',' ORDER BY privilege_type) p FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name IN (${IN}) AND grantee IN ('anon','authenticated','service_role') GROUP BY 1,2 ORDER BY 1,2`)
  snap.triggers = await run(`SELECT event_object_table t, trigger_name, string_agg(event_manipulation, ',' ORDER BY event_manipulation) ev, action_timing FROM information_schema.triggers WHERE event_object_schema='public' AND event_object_table IN (${IN}) GROUP BY 1,2,4 ORDER BY 1,2`)
  snap.functions = await run(`SELECT p.proname, md5(p.prosrc) src_md5, p.prosecdef secdef, coalesce(array_to_string(p.proacl, ','), '') acl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('work_orders_montor_update_guard','customer_tasks_write_guard','roof_drawings_update_guard','montor_has_customer_job','case_belongs_to_customer','case_is_closed','user_can_see_case','user_role') ORDER BY 1`)
  snap.lead_activities_00234 = await run(`SELECT policyname, cmd FROM pg_policies WHERE schemaname='public' AND tablename='lead_activities' ORDER BY cmd, policyname`)
  const rows: Record<string, unknown> = {}
  for (const t of TABLES) rows[t] = (await run(`SELECT count(*)::int n, coalesce(md5(string_agg(md5(x::text), '' ORDER BY x.id)), '') checksum FROM public.${t} x`))[0]
  snap.rows = rows
  console.log(JSON.stringify(snap, null, 1))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
