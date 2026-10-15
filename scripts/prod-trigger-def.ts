/** PRODUCTION read-only: triggerdefinitioner på en tabel (metadata).   npx tsx scripts/prod-trigger-def.ts <tabel> */
import { withProdReadOnly, maskDbError } from './prod-readonly'
const t = process.argv[2] ?? ''
if (!/^[a-z_]+$/.test(t)) { console.error('brug: tabel'); process.exit(2) }
withProdReadOnly('prod-trigger-def', async (run, masked) => {
  const rows = (await run(`SELECT tgname, pg_get_triggerdef(t.oid) def FROM pg_trigger t WHERE t.tgrelid = 'public.${t}'::regclass AND NOT t.tgisinternal ORDER BY 1`)) as Array<{ tgname: string; def: string }>
  console.log(`prod:${masked} ${t}`)
  for (const r of rows) console.log(`  ${r.def}`)
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
