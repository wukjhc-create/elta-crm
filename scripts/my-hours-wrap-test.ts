/** Mine timer ombryder sagen. Timer og status er de samme. Kør: npx tsx scripts/my-hours-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/tasks/my-hours-card.tsx', 'utf8')

eq('sag ombrydes', src.includes('min-w-0 break-words') && src.includes('e.work_order_title ?? e.case_title'), true)
eq('sagen klippes ikke', src.includes('className="truncate"'), false)
eq('begrundelse ombrydes', src.includes('break-words" data-testid="my-hours-rejection-reason"'), true)
eq('timer bliver', src.includes('fmtH(e.hoursNum)'), true)
eq('status-testid bliver', src.includes('data-testid="my-hours-rejected"') && src.includes('data-testid="my-hours-pending"') && src.includes('data-testid="my-hours-approved"'), true)
eq('ugen viser hoejst 12', src.includes('week.entries.slice(0, 12)'), true)
eq('tom uge bliver', src.includes('Ingen timer registreret i denne uge.'), true)

console.log(fail ? `\n${fail} fejl` : '\nmy-hours-wrap-test OK')
process.exitCode = fail ? 1 : 0
