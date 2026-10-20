/** En fejlet statuslaesning skifter ikke status og er ikke ikke-fundet. Timer-vaernet bliver. Koer: npx tsx scripts/work-order-status-read-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name)
}

const src = fs.readFileSync('src/lib/actions/work-orders.ts', 'utf8')
const start = src.indexOf('export async function changeWorkOrderStatus')
const end = src.indexOf('export async function deletePlannedWorkOrder')
const fn = src.slice(start, end)
eq('funktion findes', start > 0 && end > start, true)
eq('laesefejl foer ikke-fundet', fn.indexOf("if (readErr) return { success: false, error: 'Kunne ikke hente arbejdsordre' }") < fn.indexOf("error: 'Arbejdsordre ikke fundet'"), true)
eq('ikke-fundet bliver', fn.includes("if (!cur) return { success: false, error: 'Arbejdsordre ikke fundet' }"), true)
eq('genlaesning foer succes', fn.indexOf('if (rowErr || !row)') < fn.indexOf('hideLowProfit(row as WorkOrderRow'), true)
// main har Claudes PR4-15-tjek (samme regel, anden ordlyd) — det er det, der skal blive
eq('timerfejl bliver', fn.includes("if (timerErr) return { success: false, error: 'Kunne ikke kontrollere aktive timere — prøv igen' }"), true)
eq('timer foer opdatering', fn.indexOf('if (timerError)') < fn.indexOf('.update(patch)'), true)
eq('aktiv timer bliver', fn.includes('Kan ikke afsluttes — der er en aktiv timer på arbejdsordren'), true)

console.log(fail ? '\n' + fail + ' fejl' : '\nwork-order-status-read-test OK')
process.exitCode = fail ? 1 : 0
