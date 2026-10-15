/** Godkend timer ombryder sag og begrundelse. Timer og knapper er de samme. Koer: npx tsx scripts/time-approval-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/time-approval/time-approval-client.tsx', 'utf8')
const start = src.indexOf('data-testid="time-approval-row"')
const row = src.slice(start, src.indexOf('data-testid="time-approval-approve"', start))

eq('faner ombrydes', src.includes('flex flex-wrap gap-1 border-b'), true)
eq('gruppen ombrydes', src.includes('flex flex-wrap items-center justify-between gap-2'), true)
eq('sagstekst ombrydes', row.includes('text-xs text-gray-500 break-words'), true)
eq('sagstekst klippes ikke', row.includes('truncate'), false)
eq('sagslink bliver', row.includes('/dashboard/orders/${l.case_id}'), true)
eq('timer bliver', row.includes('fmtHours(l.hours)'), true)
eq('ikke fakturerbar bliver', row.includes('Ikke fakturerbar'), true)
eq('saerlig sats bliver', row.includes('data-testid="time-approval-rate"'), true)
eq('godkend alle bliver', src.includes('Godkend alle ({approvable.length})'), true)
eq('begrundelse ombrydes', src.includes('flex flex-wrap gap-2') && src.includes('aria-label="Begrundelse"'), true)
eq('tom ko bliver', src.includes('Ingen timer afventer godkendelse'), true)
eq('loen teksten bliver', src.includes('Godkendelse påvirker endnu ikke løn eller fakturering.'), true)

console.log(fail ? `\n${fail} fejl` : '\ntime-approval-mobile-test OK')
process.exitCode = fail ? 1 : 0
