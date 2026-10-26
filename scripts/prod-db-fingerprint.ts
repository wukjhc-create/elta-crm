/**
 * PRODUCTION read-only fingerprint (samme format som staging `cli.ts db-fingerprint`): public-skemaets politikker,
 * funktioner, grants og tabeller (md5 pr. objekt) + rækketal/checksummer for forretningstabeller + profiler pr. rolle.
 * Intet indhold ud — kun hashes og antal. JSON på stdout; sammenlign før/efter en migration.
 *   npx tsx scripts/prod-db-fingerprint.ts [--exclude-col tabel.kolonne ...] > fil.json
 * --exclude-col beregner tabellens checksum over de øvrige kolonner (bevis for at en ADD COLUMN ikke ændrede data).
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

const BUSINESS = ['customers', 'leads', 'offers', 'offer_line_items', 'service_cases', 'work_orders', 'customer_tasks', 'invoices', 'invoice_payments', 'time_logs', 'case_materials', 'case_other_costs', 'incoming_invoices', 'employees', 'profiles', 'roof_drawings', 'audit_logs']
const excluded = new Map<string, string[]>()
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--exclude-col') {
    const [t, c] = String(process.argv[++i] ?? '').split('.')
    if (/^[a-z_0-9]+$/.test(t ?? '') && /^[a-z_0-9]+$/.test(c ?? '')) excluded.set(t, [...(excluded.get(t) ?? []), c])
  }
}

withProdReadOnly('prod-db-fingerprint', async (run, masked) => {
  const fp: Record<string, unknown> = { target: `prod:${masked}` }
  fp.policies = await run(`SELECT tablename || '.' || policyname || '.' || cmd k, md5(coalesce(roles::text,'') || coalesce(qual,'') || coalesce(with_check,'')) h FROM pg_policies WHERE schemaname='public' ORDER BY 1`)
  fp.functions = await run(`SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' k, md5(replace(p.prosrc, chr(13), '') || coalesce(array_to_string(p.proacl, ','), '') || p.prosecdef::text) h FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname='public' ORDER BY 1`)
  fp.grants = await run(`SELECT table_name || '.' || grantee k, string_agg(privilege_type, ',' ORDER BY privilege_type) h FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee IN ('anon','authenticated','service_role') GROUP BY 1 ORDER BY 1`)
  fp.tables = await run(`SELECT table_name k FROM information_schema.tables WHERE table_schema='public' ORDER BY 1`)
  const rows: Record<string, unknown> = {}
  for (const t of BUSINESS) {
    const ex = excluded.get(t) ?? []
    const cols = ((await run(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='${t}' ORDER BY ordinal_position`)) as Array<{ column_name: string }>)
      .map((c) => c.column_name).filter((c) => !ex.includes(c))
    rows[t] = (await run(`SELECT count(*)::int n, coalesce(md5(string_agg(md5(ROW(${cols.map((c) => `x."${c}"`).join(', ')})::text), '' ORDER BY x.id)), '') checksum FROM public.${t} x`))[0]
  }
  fp.rows = rows
  fp.profile_roles = await run(`SELECT role::text k, count(*)::int n, count(*) FILTER (WHERE is_active)::int active FROM public.profiles GROUP BY 1 ORDER BY 1`)
  console.log(JSON.stringify(fp))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
