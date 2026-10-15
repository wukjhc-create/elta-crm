/** Kalenderen siger naar plan-koe og job uden timer ikke kan hentes. Panelerne bliver. Koer: npx tsx scripts/calendar-panel-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const page = fs.readFileSync('src/app/dashboard/calendar/page.tsx', 'utf8')
const jobs = fs.readFileSync('src/app/dashboard/calendar/planning-backlog-panel.tsx', 'utf8')

eq('ko-fejl siges', page.includes('Det tælles ikke som ingen sager.'), true)
eq('time-fejl siges', page.includes('Det tælles ikke som at tiden er registreret.'), true)
eq('paneler bliver', page.includes('<PlanningBacklogPanel') && page.includes('<JobsWithoutTimePanel'), true)
eq('kun planlaeggere', page.includes('canPlan && backlog && !backlog.success') && page.includes('canPlan && noTime && !noTime.success'), true)
eq('dato uden z bliver', jobs.includes('T12:00:00') && !jobs.includes('T12:00:00Z'), true)

console.log(fail ? `\n${fail} fejl` : '\ncalendar-panel-load-test OK')
process.exitCode = fail ? 1 : 0
