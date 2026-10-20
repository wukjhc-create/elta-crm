/** Synkroniseringshistorik siger naar listen er klippet ved 10. Koersler bliver. Koer: npx tsx scripts/sync-history-cap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/suppliers/sync-schedules-manager.tsx', 'utf8')
eq('loftet bliver 10', src.includes('history.slice(0, 10)'), true)
eq('loftet siges', src.includes('data-testid="sync-history-capped"') && src.includes('Viser 10 af {history.length} kørsler. De øvrige {history.length - 10} er ikke med i listen.'), true)
eq('kun naar der er flere', src.includes('history.length > 10 &&'), true)
eq('tom historik bliver', src.includes('Ingen kørsler endnu. Brug Kør nu, eller vent på planen.'), true)
eq('koer nu bliver', src.includes('aria-label="Kør nu"') && src.includes('handleRunNow(schedule)'), true)
eq('genforsoeg bliver', src.includes('schedule.max_retries'), true)
eq('fejltekst bliver', src.includes('{entry.error_message}'), true)

console.log(fail ? `\n${fail} fejl` : '\nsync-history-cap-test OK')
process.exitCode = fail ? 1 : 0
