/** PRODUCTION read-only: sikkerhedsprofil for navngivne funktioner (definer, search_path, EXECUTE pr. rolle). */
import { withProdReadOnly, maskDbError } from './prod-readonly'
const names = process.argv.slice(2)
withProdReadOnly('prod-fn-security', async (run) => {
  const list = names.map((n) => `'${n.replace(/'/g, '')}'`).join(',')
  for (const r of await run(`SELECT p.proname, p.prosecdef definer, p.proconfig::text cfg, has_function_privilege('authenticated', p.oid, 'EXECUTE') auth_exec,
      has_function_privilege('anon', p.oid, 'EXECUTE') anon_exec FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname IN (${list})`))
    console.log(JSON.stringify(r))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
