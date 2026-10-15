/** Kundelisten ombryder navn og mail. Betalingsmaerke og slet er de samme. Koer: npx tsx scripts/customers-list-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/customers/customers-table.tsx', 'utf8')
const start = src.indexOf('{/* Mobile card view */}')
const mobile = src.slice(start, src.indexOf('hidden md:block', start))

eq('firmanavn ombrydes', mobile.includes('break-words min-w-0">{customer.company_name}'), true)
eq('kontakt ombrydes', mobile.includes('text-sm text-gray-500 mt-0.5 break-words'), true)
eq('mail ombrydes', mobile.includes('break-all min-w-0">{customer.email}'), true)
eq('kortet klipper ikke', mobile.includes('truncate') || mobile.includes('max-w-[150px]'), false)
eq('betalingsmaerke bliver', mobile.includes('PaymentListChip'), true)
eq('auto-oprettet bliver', mobile.includes('AutoCreatedChip'), true)
eq('slet valgte bliver', src.includes('Slet valgte'), true)
eq('ryd valg bliver', src.includes('Ryd valg'), true)

console.log(fail ? `\n${fail} fejl` : '\ncustomers-list-mobile-test OK')
process.exitCode = fail ? 1 : 0
