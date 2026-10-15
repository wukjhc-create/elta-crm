/** Fakturaens PDF-ikoner har et navn, og mobilkortet viser regnskabs-id. Koer: npx tsx scripts/invoices-mobile-name-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/invoices/invoices-overview-client.tsx', 'utf8')
const start = src.indexOf('data-testid="invoices-mobile-list"')
const mobile = src.slice(start, src.indexOf('hidden md:block', start))
const desk = src.slice(src.indexOf('hidden md:block', start))

eq('mobil viser pdf', mobile.includes('aria-label="Vis PDF"') && mobile.includes('aria-label="Download PDF"'), true)
eq('desktop viser pdf', desk.includes('aria-label="Vis PDF"') && desk.includes('aria-label="Download PDF"'), true)
eq('regnskabs-id vises', mobile.includes('data-testid="invoice-mobile-external-id"') && mobile.includes('{r.accounting_external_id}'), true)
eq('id ombrydes', mobile.includes('break-all" data-testid="invoice-mobile-external-id"'), true)
eq('tomt id skjules', mobile.includes('r.accounting_external_id &&'), true)
eq('beloeb bliver', mobile.includes('kr(r.final_amount, r.currency)'), true)
eq('paamindelse bliver', mobile.includes('handleReminder(r)') && mobile.includes('Påmind'), true)
eq('kost bliver vaek', /cost_price|margin|contribution|dækningsbidrag/.test(mobile), false)

console.log(fail ? `\n${fail} fejl` : '\ninvoices-mobile-name-test OK')
process.exitCode = fail ? 1 : 0
