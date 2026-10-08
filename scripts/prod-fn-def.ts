/**
 * PRODUCTION read-only: definition af en public-funktion (pg_get_functiondef) + proconfig.  npx tsx scripts/prod-fn-def.ts <navn>
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'
const name = (process.argv[2] ?? '').replace(/[^a-z0-9_]/gi, '')
withProdReadOnly('prod-fn-def', async (run) => {
  const r = await run(`SELECT pg_get_functiondef(p.oid) def FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = '${name}'`)
  for (const x of r) console.log(x.def)
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
