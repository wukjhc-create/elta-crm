/** Projektlisten kan laeses paa mobil. Status og beloeb bliver. Koer: npx tsx scripts/projects-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/projects/projects-table.tsx', 'utf8')
const start = src.indexOf('data-testid="projects-mobile-list"')
const mobile = src.slice(start, src.indexOf('hidden md:block', start))
eq('mobilkort findes', start > 0, true)
eq('nummer bliver', mobile.includes('{project.project_number}'), true)
eq('navn ombrydes', mobile.includes('{project.name}'), true)
eq('kunde bliver', mobile.includes('{project.customer.company_name}'), true)
eq('status bliver', mobile.includes('<ProjectStatusBadge'), true)
eq('prioritet bliver', mobile.includes('<ProjectPriorityBadge'), true)
eq('timer bliver', mobile.includes('formatHours(project.actual_hours)'), true)
eq('budget bliver', mobile.includes('formatBudget(project.actual_cost)'), true)
eq('budget-gate bliver', mobile.includes('{project.budget &&'), true)
eq('dato bliver', mobile.includes('formatDate(project.start_date)'), true)
eq('desktop-tabel bliver', src.slice(start).includes('hidden md:block overflow-x-auto'), true)
eq('slet bliver', mobile.includes('handleDelete(project.id)'), true)
eq('opretter ikke projekter', src.includes('createProject'), false)

console.log(fail ? `\n${fail} fejl` : '\nprojects-mobile-test OK')
process.exitCode = fail ? 1 : 0
