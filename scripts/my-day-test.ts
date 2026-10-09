/** N29: mine forfaldne og dagens opgaver følger den danske kalender. Kør: npx tsx scripts/my-day-test.ts */
import fs from 'fs'
import { splitMyDayTasks, type MyDayTask } from '../src/lib/tasks/my-day'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)} forventet=${JSON.stringify(want)}`}`)
}

const me = 'user-1'
const row = (id: string, due: string | null, extra: Partial<MyDayTask> = {}): MyDayTask => ({
  id,
  title: id,
  assigned_to: me,
  due_date: due,
  status: 'pending',
  customer_name: 'Kunde',
  ...extra,
})

// 9/10 2026 kl. 02:30 dansk = 00:30Z (sommer, UTC+2). I dag er 9/10.
const now = new Date('2026-10-09T00:30:00.000Z')
const lists = splitMyDayTasks([
  row('igår-sent', '2026-10-08T21:30:00.000Z'), // 8/10 23:30 dansk
  row('i-dag-tidligt', '2026-10-08T22:30:00.000Z'), // 9/10 00:30 dansk
  row('i-dag-sen', '2026-10-09T14:00:00.000Z'),
  row('i-morgen', '2026-10-09T22:30:00.000Z'), // 10/10 00:30 dansk
  row('anden', '2026-10-01T10:00:00.000Z', { assigned_to: 'user-2' }),
  row('udført', '2026-10-01T10:00:00.000Z', { status: 'done' }),
  row('uden-frist', null),
  row('ældre', '2026-10-01T08:00:00.000Z'),
], me, now)

eq('forfalden er danske dage før i dag, ældste først', lists.overdue.map((t) => t.id), ['ældre', 'igår-sent'])
eq('i dag er den danske dato, også efter klokken er passeret', lists.today.map((t) => t.id), ['i-dag-tidligt', 'i-dag-sen'])
eq('andres, udførte, uden frist og fremtidige er ude', [...lists.overdue, ...lists.today].map((t) => t.id), ['ældre', 'igår-sent', 'i-dag-tidligt', 'i-dag-sen'])

// Vinter: 26/10 2026 kl. 00:30 dansk = 25/10 23:30Z (UTC+1).
const winter = new Date('2026-10-25T23:30:00.000Z')
const winterLists = splitMyDayTasks([
  row('før', '2026-10-25T22:30:00.000Z'), // 25/10 23:30 dansk
  row('nu', '2026-10-25T23:30:00.000Z'), // 26/10 00:30 dansk
], me, winter)
eq('vintertid: dagen før er forfalden', winterLists.overdue.map((t) => t.id), ['før'])
eq('vintertid: midnat dansk er i dag', winterLists.today.map((t) => t.id), ['nu'])

const tasksAction = fs.readFileSync('src/lib/actions/customer-tasks.ts', 'utf8')
const start = tasksAction.indexOf('export async function getMyDayTasks')
const body = tasksAction.slice(start, start + 1800)
eq('hentningen kalder splitMyDayTasks', body.includes('splitMyDayTasks('), true)
eq('kun egne åbne opgaver', body.includes(".eq('assigned_to', userId)") && body.includes(".neq('status', 'done')"), true)
eq('kundeopgaver hentes side for side', body.includes("from('customer_tasks')") && body.includes('fetchAllRows'), true)
eq('gamle projektopgaver bruges ikke', body.includes('project_tasks'), false)

const page = fs.readFileSync('src/app/dashboard/page.tsx', 'utf8')
eq('dashboardet viser listerne', page.includes('<MyDayTasks'), true)
eq('dashboardet henter ikke de næste fem for alle', page.includes('getUpcomingTasks'), false)
const tasksPage = fs.readFileSync('src/app/dashboard/tasks/page.tsx', 'utf8')
eq('opgavesiden viser de samme lister', tasksPage.includes('<MyDayTasks'), true)
const view = fs.readFileSync('src/components/modules/dashboard/my-day-tasks.tsx', 'utf8')
eq('visningen klassificerer ikke med servertid', view.includes('isToday') || view.includes('date-fns'), false)

console.log(fail ? `\n❌ ${fail} fejl` : '\n✅ alle mine-dag-tests bestået')
process.exitCode = fail ? 1 : 0
