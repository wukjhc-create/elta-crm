/** Udført kræver et rigtigt 0 åbne timere. Kør: npx tsx scripts/work-order-timer-count-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/lib/actions/work-orders.ts', 'utf8')
const start = src.indexOf('export async function changeWorkOrderStatus')
const fn = src.slice(start, src.indexOf('export async function deletePlannedWorkOrder'))
eq('funktionen findes', start >= 0 && fn.length > 80, true)
eq('fejl afslutter ikke', fn.includes("error: 'Kunne ikke tælle åbne timere. Det tælles ikke som 0.'"), true)
eq('fejl foer opdatering', fn.indexOf('if (timerError)') < fn.indexOf('.update(patch)'), true)
eq('aktiv timer bliver', fn.includes('Kan ikke afsluttes — der er en aktiv timer på arbejdsordren'), true)
eq('aekte nul kan afslutte', fn.includes('if ((openTimers ?? 0) > 0)'), true)

console.log(fail ? `\n${fail} fejl` : '\nwork-order-timer-count-test OK')
process.exitCode = fail ? 1 : 0
