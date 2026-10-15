/** Manglende dato siges. Personlige paamindelser ombrydes. Koer: npx tsx scripts/missing-date-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const tasks = fs.readFileSync('src/components/modules/customers/customer-tasks.tsx', 'utf8')
const overlay = fs.readFileSync('src/components/layout/task-reminder-overlay.tsx', 'utf8')
const personal = fs.readFileSync('src/app/dashboard/tasks/personal-reminders-card.tsx', 'utf8')

eq('kundeopgave uden forfald siger det', tasks.includes('Ingen forfaldsdato') && tasks.includes('task.due_date ?'), true)
eq('forfaldsdato formateres stadig', tasks.includes("format(new Date(task.due_date), 'd. MMM yyyy'"), true)
eq('paamindelse uden dato siger det', overlay.includes("'Ingen dato'") && overlay.includes('reminder.due_date'), true)
eq('luk har et navn', overlay.includes('aria-label="Luk påmindelse"'), true)
eq('prisadvarsel ombrydes', overlay.includes('break-words min-w-0">{alert.title}'), true)
eq('paamindelsestitel ombrydes', overlay.includes('break-words">{reminder.title}'), true)
eq('prisadvarsel kan lukkes med navn', overlay.includes('aria-label="Luk prisadvarsel"'), true)
eq('personlig paamindelse ombrydes', personal.includes('flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'), true)
eq('tidspunktet formateres stadig', personal.includes('fmt(r.due_at)'), true)

console.log(fail ? `\n${fail} fejl` : '\nmissing-date-test OK')
process.exitCode = fail ? 1 : 0
