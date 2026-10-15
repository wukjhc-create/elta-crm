/** Regnskabsfilter med nul traef naevner statussen. Soegning og udestaaende bliver. Koer: npx tsx scripts/invoices-acc-empty-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/invoices/invoices-overview-client.tsx', 'utf8')
eq('regnskab naevnes', src.includes('Ingen fakturaer med regnskabsstatus "${label}". Vælg Alle under regnskab, eller en anden status.'), true)
eq('kun naar det ikke er alle', src.includes("if (acc !== 'all')"), true)
eq('soegning bliver foerst', src.indexOf('Ingen fakturaer matcher søgningen') < src.indexOf('Ingen fakturaer med regnskabsstatus'), true)
eq('udestaaende bliver', src.includes('Der er ingen sendte udestående fakturaer lige nu.') && src.includes('Der er ingen udestående fakturaer lige nu.'), true)
eq('begge lister faar status', src.split('emptyInvoiceText(search, onlyOutstanding, filter, acc)').length - 1 === 2, true)
eq('filteret bliver', src.includes("if (acc !== 'all' && r.accounting_status !== acc) return false"), true)

console.log(fail ? `\n${fail} fejl` : '\ninvoices-acc-empty-test OK')
process.exitCode = fail ? 1 : 0
