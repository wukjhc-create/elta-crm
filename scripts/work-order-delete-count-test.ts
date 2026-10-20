/** Sletning af planlagt ordre kraever et laest job og et aegte 0 timer. Koer: npx tsx scripts/work-order-delete-count-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/lib/actions/work-orders.ts', 'utf8')
const fn = src.slice(src.indexOf('export async function deletePlannedWorkOrder'), src.indexOf('export async function listWorkOrdersByDateRange'))
eq('funktion findes', fn.length > 80, true)
eq('uden ret bliver', fn.includes('Manglende tilladelse: work_orders.delete'), true)
eq('laesefejl', fn.includes("error: 'Kunne ikke læse arbejdsordren. Det tælles ikke som at den ikke findes.'"), true)
eq('findes ikke bliver', fn.includes("error: 'Arbejdsordre ikke fundet'"), true)
eq('laesefejl foer mangler', fn.indexOf('if (woError)') < fn.indexOf("error: 'Arbejdsordre ikke fundet'"), true)
eq('kun planlagt bliver', fn.includes('Kun planlagte arbejdsordrer kan slettes — annullér i stedet'), true)
eq('timefejl', fn.includes("error: 'Kunne ikke tælle timeregistreringer. Det tælles ikke som 0.'"), true)
eq('timefejl foer slet', fn.indexOf('if (countError)') < fn.indexOf('.delete()'), true)
eq('har timer bliver', fn.includes('Arbejdsordre har timeregistreringer og kan ikke slettes'), true)
eq('aekte nul kan slette', fn.includes('if ((count ?? 0) > 0)'), true)
eq('status sammenlignes', fn.includes(".eq('status', 'planned')"), true)

const view = fs.readFileSync('src/app/dashboard/orders/[id]/order-planning-tab.tsx', 'utf8')
eq('bekraeftelse bliver', view.includes('Slet denne planlagte arbejdsordre? Handlingen kan ikke fortrydes.'), true)
eq('fejl vises', view.includes("setError(res.error || 'Kunne ikke slette')"), true)

console.log(fail ? `\n${fail} fejl` : '\nwork-order-delete-count-test OK')
process.exitCode = fail ? 1 : 0
