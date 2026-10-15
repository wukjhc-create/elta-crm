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
eq('kunde og leverandoer ombrydes', mobile.includes('break-words">{c.customer_label') && mobile.includes('break-words">{c.supplier_names.length'), true)
eq('desktop klipper ikke kunde', src.includes('truncate max-w-[200px]'), false)
eq('desktop-leverandoer ombrydes', src.includes('text-gray-600 text-xs break-words max-w-[16rem]'), true)
eq('fakturanavn ombrydes', src.includes('break-words text-gray-800 min-w-0">{iv.supplier_name'), true)
eq('beloeb og tom tekst er de samme', src.includes('kr(c.unconverted_amount)') && src.includes('Ingen sager kræver indkøbshandling lige nu.'), true)

console.log(fail ? `\n${fail} fejl` : '\npurchase-ops-mobile-test OK')
process.exitCode = fail ? 1 : 0
