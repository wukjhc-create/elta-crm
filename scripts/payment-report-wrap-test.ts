/** Betalingsrapportens status ombrydes. Send og gem er de samme. Kør: npx tsx scripts/payment-report-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/settings/invoice-email/payment-report-settings.tsx', 'utf8')

eq('status ombrydes', src.includes('font-medium break-all" title={value}'), true)
eq('historik ombrydes', src.includes('text-sm text-gray-800 break-words'), true)
eq('ingen truncate', src.includes('truncate'), false)
eq('test og gem bliver', src.includes('Send testrapport') && src.includes('Gem'), true)
eq('tom historik bliver', src.includes('Der er endnu ingen rapporthændelser.'), true)
eq('rettighed bliver', src.includes('disabled={!canManage || testing}') && src.includes('disabled={!canManage || pending}'), true)

console.log(fail ? `\n${fail} fejl` : '\npayment-report-wrap-test OK')
process.exitCode = fail ? 1 : 0
