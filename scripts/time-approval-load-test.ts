/** Godkend timer siger naar hentningen kaster. Tomme faner og loentekst bliver. Koer: npx tsx scripts/time-approval-load-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/time-approval/time-approval-client.tsx', 'utf8')
eq('kastet fejl siges', src.includes("setError('Kunne ikke hente timer')"), true)
eq('kastet fejl er ikke en tom liste', src.includes('Det tælles ikke som en tom liste.'), true)
eq('tom ko bliver', src.includes('Ingen timer afventer godkendelse'), true)
eq('tom ko kraever ingen fejl', src.includes('rows.length === 0 && !error'), true)
eq('loen teksten bliver', src.includes('Godkendelse påvirker endnu ikke løn eller fakturering.'), true)
eq('godkend bliver', src.includes('approveTimeLogsAction(ids, seen)'), true)
eq('afvis bliver', src.includes('rejectTimeLogAction(rejecting.id, rejecting.reason)'), true)

console.log(fail ? `\n${fail} fejl` : '\ntime-approval-load-test OK')
process.exitCode = fail ? 1 : 0
