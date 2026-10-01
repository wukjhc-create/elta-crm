/** PRODUCTION read-only: kolonneliste for tabeller.  npx tsx scripts/prod-columns.ts tabel ... */
import { withProdReadOnly, maskDbError } from './prod-readonly'
const tables = process.argv.slice(2).filter((t) => /^[a-z_0-9]+$/.test(t))
withProdReadOnly('prod-columns', async (run) => {
  for (const t of tables) console.log(`${t}: ${((await run(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='${t}' ORDER BY ordinal_position`)) as any[]).map((c) => c.column_name).join(', ')}`)
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
