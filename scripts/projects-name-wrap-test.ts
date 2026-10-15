/** Projektlisten ombryder navn og kunde. Status og timer bliver. Koer: npx tsx scripts/projects-name-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/projects/projects-table.tsx', 'utf8')

eq('navn ombrydes', src.includes('text-sm text-muted-foreground break-words') && src.includes('{project.name}'), true)
eq('navn klippes ikke til 200', src.includes('truncate max-w-[200px]'), false)
eq('kunde ombrydes', src.includes('text-sm hover:underline break-words') && src.includes('{project.customer.company_name}'), true)
eq('status bliver', src.includes('ProjectStatusBadge'), true)
eq('timer bliver', src.includes('formatHours(project.actual_hours)'), true)
eq('kundenummer bliver', src.includes('{project.customer.customer_number}'), true)

console.log(fail ? `\n${fail} fejl` : '\nprojects-name-wrap-test OK')
process.exitCode = fail ? 1 : 0
