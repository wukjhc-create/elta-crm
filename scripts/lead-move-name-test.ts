/** Mobilkanbanens flyt siger hvilket lead og hvilken fase. Synlig tekst og handlingen bliver. Koer: npx tsx scripts/lead-move-name-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/leads/leads-kanban.tsx', 'utf8')
const mobile = src.slice(src.indexOf('data-testid="leads-kanban-mobile"'), src.indexOf('hidden md:block'))
eq('flyt siger lead og fase', mobile.includes('aria-label={`Flyt ${lead.company_name} til ${LEAD_STATUS_LABELS[target]}`}'), true)
eq('synlig tekst bliver', mobile.includes('{LEAD_STATUS_LABELS[target]}'), true)
eq('samme flyt', src.includes('updateLeadStatus(leadId, targetStatus)'), true)
eq('lovlige overgange bliver', mobile.includes('LEAD_STATUS_TRANSITIONS'), true)
eq('tom fase bliver', mobile.includes('Ingen leads i denne fase.'), true)

console.log(fail ? `\n${fail} fejl` : '\nlead-move-name-test OK')
process.exitCode = fail ? 1 : 0
