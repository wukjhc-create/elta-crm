/** Kundens sager og sagens plan ombryder titlen. Koer: npx tsx scripts/title-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const cases = fs.readFileSync('src/components/modules/customers/customer-cases-tab.tsx', 'utf8')
const plan = fs.readFileSync('src/app/dashboard/orders/[id]/order-planning-tab.tsx', 'utf8')

eq('kundens sagstitel ombrydes', cases.includes('break-words">{displayTitle}'), true)
eq('kundens badges ombrydes', cases.includes('flex flex-wrap items-center gap-2 mb-0.5'), true)
eq('planens titel ombrydes', plan.includes('break-words">{wo.title}'), true)
eq('planen siger stadig ingen opgaver', plan.includes('Ingen planlagte opgaver endnu'), true)
eq('planens overskrift ombrydes', plan.includes('flex flex-wrap items-start justify-between gap-3'), true)
eq('planens formular ombrydes', plan.includes('flex flex-wrap justify-end gap-2 pt-2'), true)
eq('medarbejdermail ombrydes', plan.includes('hover:underline break-all'), true)
eq('titel har et navn', plan.includes('aria-label="Titel"'), true)
eq('opret bliver', plan.includes('Opret arbejdsordre'), true)

console.log(fail ? `\n${fail} fejl` : '\ntitle-wrap-test OK')
process.exitCode = fail ? 1 : 0
