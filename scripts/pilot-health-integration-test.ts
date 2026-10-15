/** Pilot-health siger naar integrationer ikke kan laeses. Et aegte tomt svar bliver. Koer: npx tsx scripts/pilot-health-integration-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const msg = 'Kunne ikke læses. Det tælles ikke som ingen.'
const src = fs.readFileSync('src/lib/ops/pilot-health.ts', 'utf8')
const start = src.indexOf('async function integrationItems')
const end = src.indexOf('export const ANON_READ_PROBES')
const fn = src.slice(start, end)
eq('funktion findes', start > 0 && end > start, true)
eq('tekst', fn.includes(msg), true)
eq('mail siger fejl foer tom', fn.indexOf('if (graph.error)') < fn.indexOf('ingen postkasser synkroniseret'), true)
eq('regnskab siger fejl foer ikke konfigureret', fn.indexOf('if (econ.error)') < fn.indexOf('ikke konfigureret'), true)
eq('bank siger fejl foer aldrig', fn.indexOf('if (bank.error)') < fn.indexOf('seneste postering importeret'), true)
eq('sync siger fejl foer ingen log', fn.indexOf('if (lemu.error)') < fn.indexOf('ingen sync-log'), true)
eq('credentials siger fejl foer gront nul', fn.indexOf('creds.error') < fn.indexOf('værdier vises aldrig'), true)
eq('daekning bliver unknown ved fejl', fn.includes("label: 'Fakturakontrol-dækning', level: 'unknown'"), true)
eq('daekningstal bliver', fn.includes('cov.overchargeAmount'), true)
eq('mail-status bliver', fn.includes("m.last_sync_status !== 'success' ? 'red'"), true)

console.log(fail ? `\n${fail} fejl` : '\npilot-health-integration-test OK')
process.exitCode = fail ? 1 : 0
