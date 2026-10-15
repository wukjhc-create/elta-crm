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
eq('mobilnavn ombrydes', mobile.includes('break-words">{lead.company_name}'), true)
eq('desktopnavn ombrydes', src.includes('text-sm font-semibold text-gray-900 break-words'), true)
eq('vaerdi bliver', src.includes('formatCurrency(lead.value)'), true)
eq('traek bliver', src.includes('handleDragStart(e, lead.id)'), true)
eq('tom fase bliver', src.includes('Ingen leads i denne fase.'), true)
eq('tom fase siger naeste skridt', mobile.includes('Vælg en anden fase, eller brug Ny Lead.'), true)
eq('mobil viser ansvarlig', mobile.includes('Ansvarlig: {lead.assigned_to_profile.full_name}'), true)
eq('desktop-meta kan ombrydes', src.includes('flex flex-wrap items-center justify-between gap-x-2 gap-y-1 mt-2'), true)

console.log(fail ? `\n${fail} fejl` : '\nleads-kanban-mobile-test OK')
process.exitCode = fail ? 1 : 0
