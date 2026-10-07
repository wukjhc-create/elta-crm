/**
 * PRODUCTION read-only: findes en kolonne? (metadata)   npx tsx scripts/prod-col-exists.ts tabel kolonne
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'
const [t, c] = process.argv.slice(2)
if (!/^[a-z_]+$/.test(t ?? '') || !/^[a-z_]+$/.test(c ?? '')) { console.error('brug: tabel kolonne'); process.exit(2) }
withProdReadOnly('prod-col-exists', async (run, masked) => {
  const r = (await run(`SELECT count(*)::int n FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${t}' AND column_name = '${c}'`)) as Array<{ n: number }>
  console.log(`${t}.${c} @ prod:${masked}: ${r[0].n ? 'FINDES' : 'FINDES IKKE'}`)
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
