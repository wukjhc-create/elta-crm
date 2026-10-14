/** Lead-kanban på små skærme viser én fase og kun lovlige flyt. Kør: npx tsx scripts/leads-kanban-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/leads/leads-kanban.tsx', 'utf8')
const mobile = src.slice(src.indexOf('data-testid="leads-kanban-mobile"'), src.indexOf('hidden md:block'))

eq('mobil-kanban findes', mobile.length > 40, true)
eq('mobil-kanban bruger de lovlige overgange', mobile.includes('LEAD_STATUS_TRANSITIONS'), true)
eq('mobil-kanban flytter via samme handling', src.includes('updateLeadStatus(leadId, targetStatus)'), true)
eq('skrivebordet er skjult under md', src.includes('hidden md:block overflow-x-auto'), true)

console.log(fail ? `\n${fail} fejl` : '\nleads-kanban-mobile-test OK')
process.exitCode = fail ? 1 : 0
