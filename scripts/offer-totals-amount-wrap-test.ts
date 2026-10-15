/** Tilbuddets totaler ombrydes. formatCurrency bliver. Koer: npx tsx scripts/offer-totals-amount-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name)
}

const src = fs.readFileSync('src/app/dashboard/offers/[id]/offer-detail-client.tsx', 'utf8')
const start = src.indexOf('w-full sm:w-64 space-y-2 min-w-0')
const end = src.indexOf('offer.terms_and_conditions', start)
const block = src.slice(start, end)
eq('totalblok findes', start > 0 && end > start, true)
eq('subtotal ombrydes', block.includes('break-words">{formatCurrency(offer.total_amount, currency, 2)}'), true)
eq('rabat ombrydes', block.includes('break-words">-{formatCurrency(offer.discount_amount, currency, 2)}'), true)
eq('moms ombrydes', block.includes('break-words">{formatCurrency(offer.tax_amount, currency, 2)}'), true)
eq('total ombrydes', block.includes('break-words">{formatCurrency(offer.final_amount, currency, 2)}'), true)
eq('rabatprocent bliver', block.includes('{offer.discount_percentage}%'), true)
eq('momsprocent bliver', block.includes('{offer.tax_percentage}%'), true)
eq('kolonne bliver', block.includes('w-full sm:w-64 space-y-2 min-w-0'), true)
eq('ingen shrink-0', block.includes('shrink-0'), false)

console.log(fail ? '\n' + fail + ' fejl' : '\noffer-totals-amount-wrap-test OK')
process.exitCode = fail ? 1 : 0
