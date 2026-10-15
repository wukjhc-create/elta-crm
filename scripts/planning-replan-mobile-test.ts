/** Dato og montør kan rettes på sagens plan, kun for planlagte og igangværende. Kør: npx tsx scripts/planning-replan-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const plan = fs.readFileSync('src/app/dashboard/orders/[id]/order-planning-tab.tsx', 'utf8')
const server = fs.readFileSync('src/lib/actions/work-orders.ts', 'utf8')
const marker = plan.indexOf('data-testid="work-order-replan"')
const replan = plan.slice(Math.max(0, marker - 80), plan.indexOf('Time logs (Sprint 4C)'))

eq('formularen findes', replan.length > 40, true)
eq('felter stables paa mobil', replan.includes('grid grid-cols-1 sm:grid-cols-2'), true)
eq('dato har et navn', replan.includes('aria-label="Ret planlagt dato"'), true)
eq('montor har et navn', replan.includes('aria-label="Ret medarbejder"'), true)
eq('gem hedder dato og montor', replan.includes('Gem dato og montør'), true)
eq('kun aabne ordrer med plan-ret', plan.includes("canPlan && (wo.status === 'planned' || wo.status === 'in_progress')"), true)
eq('kalder eksisterende opdatering', plan.includes('updateWorkOrderPlanning(woId, patch)') && !plan.includes('export async function updateWorkOrderPlanning'), true)
eq('opret bliver', plan.includes('Opret arbejdsordre'), true)
eq('server kraever plan-ret', server.includes("hasPermission('work_orders.plan')"), true)
eq('server afviser udfoerte', server.includes('En udført eller annulleret arbejdsordre kan ikke omplanlægges'), true)

console.log(fail ? `\n${fail} fejl` : '\nplanning-replan-mobile-test OK')
process.exitCode = fail ? 1 : 0
