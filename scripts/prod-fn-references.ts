/**
 * PRODUCTION read-only: refererer policies, views eller funktioner til et funktionsnavn? (antal pr. kategori, ingen kode ud)
 *   npx tsx scripts/prod-fn-references.ts <funktionsnavn>
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

const fn = process.argv[2] ?? ''
if (!/^[a-z_0-9]+$/.test(fn)) { console.error('brug: prod-fn-references.ts <funktionsnavn>'); process.exit(2) }
withProdReadOnly('prod-fn-references', async (run, masked) => {
  const pol = (await run(`SELECT count(*)::int n FROM pg_policies WHERE coalesce(qual,'') || coalesce(with_check,'') LIKE '%${fn}%'`))[0].n
  const funcs = (await run(`SELECT count(*)::int n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace WHERE ns.nspname = 'public' AND p.proname <> '${fn}' AND p.prosrc LIKE '%${fn}%'`))[0].n
  const views = (await run(`SELECT count(*)::int n FROM pg_views WHERE schemaname = 'public' AND definition LIKE '%${fn}%'`))[0].n
  const sigs = (await run(`SELECT string_agg(pg_get_function_identity_arguments(p.oid), ' | ') s FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace WHERE ns.nspname = 'public' AND p.proname = '${fn}'`))[0].s
  console.log(JSON.stringify({ target: `prod:${masked}`, fn, signatures: sigs, policies: pol, functions: funcs, views }))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
