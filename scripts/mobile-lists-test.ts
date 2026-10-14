/** Mobilkort på lead-, tilbuds- og sagslisten. Kør: npx tsx scripts/mobile-lists-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

function between(file: string, start: string, end: string): string {
  const text = fs.readFileSync(file, 'utf8')
  const a = text.indexOf(start)
  const b = text.indexOf(end, a + start.length)
  return a >= 0 && b > a ? text.slice(a, b) : ''
}

const leads = between('src/components/modules/leads/leads-table.tsx', 'data-testid="leads-mobile-list"', 'hidden md:block')
const offers = between('src/components/modules/offers/offers-table.tsx', 'data-testid="offers-mobile-list"', 'hidden md:block')
const orders = between('src/app/dashboard/orders/orders-list-client.tsx', 'data-testid="orders-mobile-list"', 'hidden md:block')

eq('leadkort findes', leads.length > 0, true)
eq('leadkort skifter ikke status ved et tryk', leads.includes('onStatusChange'), false)
eq('leadkort beholder webhenvendelsen', leads.includes('lead-row-inquiry'), true)
eq('leadtabellen er skjult på mobil', fs.readFileSync('src/components/modules/leads/leads-table.tsx', 'utf8').includes('hidden md:block'), true)

eq('tilbudskort findes', offers.length > 0, true)
eq('tilbudskort skifter ikke status ved et tryk', offers.includes('onStatusChange'), false)
eq('tilbudskort viser beløb ekskl. moms', offers.includes('ekskl. moms'), true)
eq('tilbudskort beholder udløb og sag', offers.includes('OfferExpiryChip') && offers.includes('OfferConversionBadge'), true)

eq('sagskort findes', orders.length > 0, true)
eq('sagskort viser tilbudt og revideret', orders.includes('contract_sum') && orders.includes('revised_sum'), true)
eq('sagskort viser fakturering kun med samme gate', orders.includes('canSeeBilling') && orders.includes('net_invoiced'), true)
eq('sagskort viser ikke dækningsbidrag eller kost', /db_|cost_price|hourly_rate|contribution/.test(orders), false)
eq('sagskort beholder haster-mærket', orders.includes('order-priority'), true)

console.log(fail ? `\n${fail} fejl` : '\nmobile-lists-test OK')
process.exitCode = fail ? 1 : 0
