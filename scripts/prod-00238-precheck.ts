/**
 * PRODUCTION read-only pre-check for 00238 (per-medarbejder-rettigheder): er migrationen allerede anvendt, og hvad er
 * udgangspunktet? Kun antal/hashes — intet indhold, ingen id'er.
 *   npx tsx scripts/prod-00238-precheck.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-00238-precheck', async (run, masked) => {
  const one = async (sql: string) => (await run(sql))[0]
  const r = {
    target: `prod:${masked}`,
    tables_00238: (await one(`SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('permission_catalog','role_permission_defaults','user_permission_overrides')`)).n,
    profiles_permission_template_col: (await one(`SELECT count(*)::int n FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='permission_template'`)).n,
    user_has_permission_signatures: (await one(`SELECT string_agg(pg_get_function_identity_arguments(p.oid), ' | ') s FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='user_has_permission'`)).s,
    policies: (await one(`SELECT count(*)::int n FROM pg_policies WHERE schemaname='public'`)).n,
    functions: (await one(`SELECT count(*)::int n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'`)).n,
    profiles_by_role: await run(`SELECT role::text r, count(*)::int n, count(*) FILTER (WHERE is_active)::int active FROM public.profiles GROUP BY 1 ORDER BY 1`),
  }
  console.log(JSON.stringify(r))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
