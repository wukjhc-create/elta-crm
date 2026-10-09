/**
 * PRODUCTION read-only: indeholder en funktions definition bestemte tekststykker? (kun ja/nej — ingen definition ud)
 *   npx tsx scripts/prod-fn-def-check.ts funktionsnavn "tekst1" "tekst2" …
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'
const fn = process.argv[2]
const needles = process.argv.slice(3)
if (!/^[a-z_]+$/.test(fn ?? '') || needles.length === 0) { console.error('brug: funktionsnavn tekst…'); process.exit(2) }
withProdReadOnly('prod-fn-def-check', async (run, masked) => {
  const rows = await run(`SELECT pg_get_functiondef(p.oid) def FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = '${fn}'`)
  const def = String((rows[0] as { def?: string } | undefined)?.def ?? '')
  console.log(`--- ${fn} @ prod:${masked} (findes: ${def ? 'ja' : 'nej'}) ---`)
  for (const n of needles) console.log(`${def.includes(n) ? 'JA ' : 'NEJ'}  "${n}"`)
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
