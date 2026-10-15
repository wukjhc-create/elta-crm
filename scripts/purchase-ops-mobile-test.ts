/** Indkøbsdrift på små skærme. Kør: npx tsx scripts/purchase-ops-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/purchase-operations/purchase-operations-client.tsx', 'utf8')
const start = src.indexOf('data-testid="purchase-ops-mobile"')
const end = src.indexOf('hidden md:block bg-white rounded-lg border overflow-hidden')
const mobile = src.slice(start, end)
const amount = mobile.indexOf('unconverted_amount')

eq('mobil-liste findes', start > 0, true)
eq('tabellen er skjult under md', end > start, true)
eq('kortet viser sag, aarsag og links', mobile.includes('case_number') && mobile.includes('action_reasons') && mobile.includes('Åbn sag') && mobile.includes('top_invoice_link'), true)
eq('beloeb paa kortet kraever canAmt', amount > mobile.lastIndexOf('canAmt', amount) && mobile.lastIndexOf('canAmt', amount) > 0, true)
eq('linjer kan foldes ud med samme komponent', mobile.includes('toggleExpand') && mobile.includes('ExpandedInvoices'), true)
eq('paging ligger uden for kortet', mobile.includes('data.total_pages'), false)
eq('paging findes stadig', src.includes('Side {data.page} / {data.total_pages}'), true)

console.log(fail ? `\n${fail} fejl` : '\npurchase-ops-mobile-test OK')
process.exitCode = fail ? 1 : 0
