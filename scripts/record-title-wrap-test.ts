/** Kunde- og projektnavn ombrydes i sidehovedet. Status og budget-gate bliver. Koer: npx tsx scripts/record-title-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const customer = fs.readFileSync('src/app/dashboard/customers/[id]/customer-detail-client.tsx', 'utf8')
const project = fs.readFileSync('src/app/dashboard/projects/[id]/project-detail-client.tsx', 'utf8')
eq('kundenavn ombrydes', customer.includes('text-2xl sm:text-3xl font-bold text-gray-900 max-w-full break-words') && customer.includes('{customer.company_name}'), true)
eq('aktiv bliver', customer.includes('Aktiv'), true)
eq('projektnavn ombrydes', project.includes('text-lg text-muted-foreground break-words">{project.name}'), true)
eq('badges maa ombrydes', project.includes('flex flex-wrap items-center gap-3'), true)
eq('budget-gate bliver', project.includes('project.budget && project.actual_cost > project.budget'), true)
eq('status bliver', project.includes('<ProjectStatusBadge status={project.status} />'), true)

console.log(fail ? `\n${fail} fejl` : '\nrecord-title-wrap-test OK')
process.exitCode = fail ? 1 : 0
