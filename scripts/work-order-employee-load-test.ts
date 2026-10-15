/** Arbejdsordrer siger naar medarbejdernavnet ikke kan hentes. Tom tildeling bliver. Koer: npx tsx scripts/work-order-employee-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/lib/actions/work-orders.ts', 'utf8')
const start = src.indexOf('export async function listWorkOrdersForCase')
const fn = src.slice(start, src.indexOf('export async function createWorkOrderForCase'))
eq('funktionen findes', start >= 0 && fn.length > 80, true)
eq('navne siger fejl', fn.includes("error: 'Kunne ikke hente medarbejdere. Det tælles ikke som ingen tildelt.'"), true)
eq('fejl foer navnekort', fn.indexOf('if (empError)') < fn.indexOf('(emps || []).map'), true)
eq('ordrefejl bliver', fn.includes("error: 'Kunne ikke hente arbejdsordrer'"), true)
eq('uden id slaar ikke fejl', fn.includes('if (employeeIds.length > 0)'), true)

const view = fs.readFileSync('src/app/dashboard/orders/[id]/order-planning-tab.tsx', 'utf8')
eq('tom tildeling bliver', view.includes('— ingen tildelt —'), true)
eq('vaelgeren bliver', view.includes('— Ingen tildelt —'), true)
eq('foerste fejl er ikke tom plan', view.includes('planningLoadView(workOrders !== null, error)'), true)

console.log(fail ? `\n${fail} fejl` : '\nwork-order-employee-load-test OK')
process.exitCode = fail ? 1 : 0
