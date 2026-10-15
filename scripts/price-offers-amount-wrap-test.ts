/** Paavirkede tilbuds beloeb ombrydes. formatCurrency bliver, og filen har ikke truncate. Koer: npx tsx scripts/price-offers-amount-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name)
}

const src = fs.readFileSync('src/app/dashboard/pricing/pricing-client.tsx', 'utf8')
const start = src.indexOf('data-testid="price-offers-mobile"')
const end = src.indexOf('hidden md:block', start)
const mobile = src.slice(start, end)
eq('kortet findes', start > 0 && end > start, true)
eq('beloeb ombrydes', mobile.includes('tabular-nums font-medium break-words">{formatCurrency(offer.total_amount)}'), true)
eq('tab ombrydes', mobile.includes('tabular-nums font-medium break-words ${offer.potential_loss > 0'), true)
eq('beloeb bliver', mobile.includes('formatCurrency(offer.total_amount)'), true)
eq('tabtegn bliver', mobile.includes("offer.potential_loss > 0 ? '-' : '+'}"), true)
eq('tabbeloeb bliver', mobile.includes('formatCurrency(Math.abs(offer.potential_loss))'), true)
eq('linjer bliver', mobile.includes('{offer.affected_items}'), true)
eq('ingen truncate', src.includes('truncate'), false)

console.log(fail ? '\n' + fail + ' fejl' : '\nprice-offers-amount-wrap-test OK')
process.exitCode = fail ? 1 : 0
