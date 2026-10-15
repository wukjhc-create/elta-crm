/** Planlaegningskoeen siger naar medarbejdere ikke kan hentes. Et tildelt job bliver ikke uden montor. Koer: npx tsx scripts/planning-backlog-employees-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/lib/actions/planning-backlog.ts', 'utf8')
const start = src.indexOf('export async function getPlanningBacklogAction')
const end = src.indexOf('async function workOrdersWithTime')
const body = src.slice(start, end)
eq('funktion findes', body.length > 80, true)
eq('fejl logges', body.includes("logger.error('getPlanningBacklogAction: employees failed'"), true)
eq('fejl bliver ikke en tom aktiv-liste', body.includes('const activeIds = empErr ? null : new Set'), true)
eq('tildelt job kraever kendte medarbejdere', body.includes('!x.assigned_employee_id || (activeIds !== null && !activeIds.has(x.assigned_employee_id))'), true)
eq('flaget foelger med', body.includes('employees_failed: !!empErr'), true)
eq('aegte tom sag-liste bliver', body.includes('if (!list.length) return { success: true, data: { items: [], total: 0 } }'), true)
eq('arbejdsordre-fejl bliver', body.includes("return { success: false, error: 'Kunne ikke hente arbejdsordrer' }"), true)
eq('dansk dato bliver', body.includes('copenhagenParts(new Date()).date'), true)

const page = fs.readFileSync('src/app/dashboard/calendar/page.tsx', 'utf8')
eq('siden siger det', page.includes('data-testid="planning-backlog-employees-error"') && page.includes('Det tælles ikke som manglende montør.'), true)
eq('ko-fejl bliver', page.includes('data-testid="planning-backlog-load-error"'), true)
eq('panelet bliver', page.includes('<PlanningBacklogPanel'), true)

const panel = fs.readFileSync('src/app/dashboard/calendar/planning-backlog-panel.tsx', 'utf8')
eq('tom koe skjules stadig', panel.includes('if (total === 0) return null'), true)
eq('uden montor bliver', panel.includes('missing_employee: \'Arbejdsordre uden montør\''), true)

console.log(fail ? `\n${fail} fejl` : '\nplanning-backlog-employees-test OK')
process.exitCode = fail ? 1 : 0
