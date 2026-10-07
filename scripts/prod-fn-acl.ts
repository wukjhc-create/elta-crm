/**
 * PRODUCTION read-only: funktions-ACL og EXECUTE-ret pr. rolle.   npx tsx scripts/prod-fn-acl.ts funktionsnavn
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'
const fn = process.argv[2]
if (!/^[a-z_]+$/.test(fn ?? '')) { console.error('brug: funktionsnavn'); process.exit(2) }
withProdReadOnly('prod-fn-acl', async (run, masked) => {
  const rows = await run(`SELECT p.oid::regprocedure::text sig, p.proacl::text acl, p.prosecdef secdef,
      has_function_privilege('service_role', p.oid, 'EXECUTE') service_role,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') authenticated
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = '${fn}'`)
  console.log(`--- ${fn} @ prod:${masked} ---`)
  console.table(rows)
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
