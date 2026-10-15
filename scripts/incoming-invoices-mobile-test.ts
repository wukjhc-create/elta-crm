/** Mobilkort på leverandørfaktura-listen. Kør: npx tsx scripts/incoming-invoices-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const file = 'src/app/dashboard/incoming-invoices/list-client.tsx'
const text = fs.readFileSync(file, 'utf8')
const start = 'data-testid="incoming-invoices-mobile-list"'
const end = 'hidden md:block'
const a = text.indexOf(start)
const b = text.indexOf(end, a + start.length)
const mobile = a >= 0 && b > a ? text.slice(a, b) : ''

eq('faktura-kort findes', mobile.length > 0, true)
eq('kortet viser beløb inkl. moms', mobile.includes('amount_incl_vat'), true)
eq('kortet viser samme statusmærke', mobile.includes('<StatusBadge'), true)
eq('kortet viser ikke-en-faktura-mærket', mobile.includes('<NotInvoiceBadge'), true)
eq('kortet viser forfald med etiket', mobile.includes('withLabel'), true)
eq('kortet har eget Åbn-link', mobile.includes('Åbn'), true)
eq('Åbn-linket ligger ikke inde i leverandør-linket', mobile.indexOf('</Link>') < mobile.indexOf('Åbn'), true)
eq('kortlisten indeholder ikke tabellen', mobile.includes('<table'), false)
eq('tabellen er skjult på mobil', text.includes('hidden md:block'), true)
eq('skrivebordet beholder test-id til U123', text.includes('invoice-not-invoice-badge'), true)
eq('kortet opretter ikke testfaktura', mobile.includes('createTestIncomingInvoiceAction'), false)
eq('leverandoer ombrydes', mobile.includes('break-words min-w-0'), true)
eq('fakturanummer ombrydes', mobile.includes('break-all'), true)
eq('tom forfald siger forfald', text.includes('Ingen godkendte fakturaer med dette forfald.'), true)
eq('tom kategori bliver', text.includes('Ingen fakturaer i denne kategori.'), true)
eq('tom tekst bruges begge steder', text.split('emptyListText(due)').length === 3, true)

console.log(fail ? `\n${fail} fejl` : '\nincoming-invoices-mobile-test OK')
process.exitCode = fail ? 1 : 0
