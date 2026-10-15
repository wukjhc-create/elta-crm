/** Planlaegningens koer ombryder titel og kunde. Koer: npx tsx scripts/planning-backlog-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/calendar/planning-backlog-panel.tsx', 'utf8')
const backlog = src.slice(src.indexOf('export function PlanningBacklogPanel'), src.indexOf('export function JobsWithoutTimePanel'))
const jobs = src.slice(src.indexOf('export function JobsWithoutTimePanel'))

eq('backlog-titel ombrydes', backlog.includes('break-words" data-testid="planning-backlog-item"'), true)
eq('backlog-kunde ombrydes', backlog.includes('text-xs text-gray-500 break-words">{it.customer_name'), true)
eq('backlog-raekke ombrydes', backlog.includes('flex flex-wrap items-center justify-between gap-3'), true)
eq('job-titel ombrydes', jobs.includes('break-words" data-testid="jobs-without-time-item"'), true)
eq('job uden sag ombrydes', jobs.includes('break-words" data-testid="jobs-without-time-item">{it.title}'), true)
eq('aarsag bliver', src.includes('Arbejdsordre uden montør') && jobs.includes('Afsluttet uden tid') && backlog.includes('REASON[it.reason]'), true)

console.log(fail ? `\n${fail} fejl` : '\nplanning-backlog-mobile-test OK')
process.exitCode = fail ? 1 : 0
