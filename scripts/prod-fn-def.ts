/** PRODUCTION read-only: pg_get_functiondef + ACL for navngivne funktioner.  npx tsx scripts/prod-fn-def.ts navn ... */
import { withProdReadOnly, maskDbError } from './prod-readonly'
const names = process.argv.slice(2).filter((n) => /^[a-z_0-9]+$/.test(n))
withProdReadOnly('prod-fn-def', async (run) => {
  for (const n of names) {
    const rows = (await run(`SELECT p.proname, p.proacl::text acl, pg_get_functiondef(p.oid) def FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace WHERE ns.nspname='public' AND p.proname='${n}'`)) as Array<{ proname: string; acl: string | null; def: string }>
    for (const r of rows) console.log(`-- ${r.proname} acl=${r.acl}\n${r.def}\n`)
  }
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
