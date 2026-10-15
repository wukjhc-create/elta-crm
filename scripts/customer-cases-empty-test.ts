/** Kundens sagsliste peger paa Ordrer uden en raa sti. Titlen ombrydes. Koer: npx tsx scripts/customer-cases-empty-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/components/modules/customers/customer-cases-tab.tsx', 'utf8')
eq('tom liste bliver', src.includes('Ingen sager endnu'), true)
eq('naeste skridt er mailen', src.includes('Opret sag fra mail'), true)
eq('linket hedder Ordrer', src.includes('>Ordrer</Link>'), true)
eq('stien er ikke linktekst', src.includes('>/dashboard/orders<'), false)
eq('ordrer-linket bliver', src.includes('href="/dashboard/orders"'), true)
eq('raekken starter oeverst', src.includes('flex items-start gap-3 p-4'), true)
eq('titel ombrydes', src.includes('text-sm font-medium text-gray-900 break-words'), true)
eq('sagen aabnes stadig', src.includes('href={`/dashboard/orders/${sag.id}`}'), true)
eq('sagsnummer bliver', src.includes('{sag.case_number}'), true)

console.log(fail ? `\n${fail} fejl` : '\ncustomer-cases-empty-test OK')
process.exitCode = fail ? 1 : 0
