/** Leadkortet viser kilde, sandsynlighed og ansvarlig. Status skiftes ikke ved et tryk. Koer: npx tsx scripts/leads-mobile-meta-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/leads/leads-table.tsx', 'utf8')
const start = src.indexOf('data-testid="leads-mobile-list"')
const mobile = src.slice(start, src.indexOf('hidden md:block', start))

eq('kilde vises', mobile.includes('data-testid="lead-mobile-source"') && mobile.includes('LEAD_SOURCE_LABELS[lead.source]'), true)
eq('kilde ombrydes', mobile.includes('break-words" data-testid="lead-mobile-source"'), true)
eq('sandsynlighed bliver', mobile.includes('lead.probability !== null') && mobile.includes('{lead.probability}% sandsynlighed'), true)
eq('ansvarlig vises', mobile.includes('data-testid="lead-mobile-assignee"'), true)
eq('ansvarlig ombrydes', mobile.includes('break-words" data-testid="lead-mobile-assignee"'), true)
eq('navnet er det samme', mobile.includes('lead.assigned_to_profile?.full_name || lead.assigned_to_profile?.email'), true)
eq('status skiftes ikke', mobile.includes('onStatusChange'), false)
eq('vaerdi bliver', mobile.includes('formatValue(lead.value)'), true)

console.log(fail ? `\n${fail} fejl` : '\nleads-mobile-meta-test OK')
process.exitCode = fail ? 1 : 0
