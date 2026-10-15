/** En fejlet statuslaesning omplanlaegger ikke og er ikke ikke-fundet. Udfoert-vaernet bliver. Koer: npx tsx scripts/work-order-replan-read-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name)
}

const src = fs.readFileSync('src/lib/actions/work-orders.ts', 'utf8')
const start = src.indexOf('export async function updateWorkOrderPlanning')
const end = src.indexOf('export async function changeWorkOrderStatus')
const fn = src.slice(start, end)
eq('funktion findes', start > 0 && end > start, true)
eq('laesefejl foer ikke-fundet', fn.indexOf("error: 'Kunne ikke hente arbejdsordre'") < fn.indexOf("error: 'Arbejdsordre ikke fundet'"), true)
eq('laesefejl foer vaernet', fn.indexOf("error: 'Kunne ikke hente arbejdsordre'") < fn.indexOf('En udført eller annulleret arbejdsordre kan ikke omplanlægges'), true)
eq('ikke-fundet bliver', fn.includes("error: 'Arbejdsordre ikke fundet'"), true)
eq('vaernet bliver', fn.includes("['done', 'cancelled'].includes((curWo as { status: string }).status)"), true)
eq('opdatering bliver', fn.includes(".in('status', ['planned', 'in_progress'])"), true)

console.log(fail ? '\n' + fail + ' fejl' : '\nwork-order-replan-read-test OK')
process.exitCode = fail ? 1 : 0
