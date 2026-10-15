/**
 * PRODUCTION read-only pre/post for 00230: sats-motoren uden skjult 495/400 + ACL + trigger SECURITY DEFINER, og at
 * eksisterende frosne snapshots er uændrede (checksum). Kun metadata/aggregater.   npx tsx scripts/prod-check-00230.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'
withProdReadOnly('prod-check-00230', async (run, masked) => {
  const f = (await run(`SELECT p.proname, p.prosecdef secdef, pg_get_functiondef(p.oid) LIKE '%495%' has495, pg_get_functiondef(p.oid) LIKE '%, 400)%' has400,
      has_function_privilege('anon', p.oid, 'EXECUTE') anon, has_function_privilege('authenticated', p.oid, 'EXECUTE') auth
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname='public' AND p.proname IN ('compute_time_log_rates','time_logs_set_cost_amount') ORDER BY 1`)) as Array<Record<string, unknown>>
  const s = (await run(`SELECT count(*)::int n, md5(string_agg(id::text || ':' || coalesce(sale_rate_snapshot::text,'-') || ':' || coalesce(cost_rate_snapshot::text,'-') || ':' || coalesce(sale_amount::text,'-') || ':' || coalesce(cost_amount::text,'-'), ',' ORDER BY id)) c FROM public.time_logs`)) as Array<{ n: number; c: string | null }>
  console.log(`prod:${masked} ${f.map((r) => `${r.proname}{secdef=${r.secdef} 495=${r.has495} 400=${r.has400} anon=${r.anon} auth=${r.auth}}`).join(' ')} · time_logs=${s[0].n} snapshot-checksum=${(s[0].c ?? '-').slice(0, 12)}`)
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
