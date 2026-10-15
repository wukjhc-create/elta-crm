/** Portaltilbuddets linjer og totaler ombrydes. formatCurrency bliver. Koer: npx tsx scripts/portal-offer-amount-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name)
}

const src = fs.readFileSync('src/components/modules/portal/offer-detail.tsx', 'utf8')
const start = src.indexOf('data-testid="portal-offer-lines-mobile"')
const end = src.indexOf('hidden md:block', start)
const mobile = src.slice(start, end)
const totalsStart = src.indexOf('bg-gray-50 p-6 space-y-2 min-w-0', end)
const totalsEnd = src.indexOf('offer.terms_and_conditions', totalsStart)
const totals = src.slice(totalsStart, totalsEnd)
eq('linjekort findes', start > 0 && end > start, true)
eq('linjetotal ombrydes', mobile.includes('break-words">{formatCurrency(item.total, currency, 2)}'), true)
eq('enhedslinje ombrydes', mobile.includes('text-xs tabular-nums text-gray-600 break-words'), true)
eq('beskrivelse bliver', mobile.includes('break-words text-gray-900">{item.description}'), true)
eq('antal bliver', mobile.includes('{item.quantity} {item.unit}'), true)
eq('enhedspris bliver', mobile.includes('formatCurrency(item.unit_price, currency, 2)'), true)
eq('ingen shrink-0', mobile.includes('shrink-0'), false)
eq('totalblok findes', totalsStart > end && totalsEnd > totalsStart, true)
eq('subtotal ombrydes', totals.includes('break-words">') && totals.includes('formatCurrency(offer.total_amount, currency, 2)'), true)
eq('rabat ombrydes', totals.includes('text-green-600 break-words'), true)
eq('moms ombrydes', totals.includes('formatCurrency(offer.tax_amount, currency, 2)'), true)
eq('total ombrydes', totals.includes('text-primary break-words'), true)
eq('rabatprocent bliver', totals.includes('{offer.discount_percentage}%'), true)
eq('momsprocent bliver', totals.includes('{offer.tax_percentage}%'), true)

console.log(fail ? '\n' + fail + ' fejl' : '\nportal-offer-amount-wrap-test OK')
process.exitCode = fail ? 1 : 0
