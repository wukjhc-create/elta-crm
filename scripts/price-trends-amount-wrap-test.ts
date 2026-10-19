/** Pristendensens nuvaerende pris ombrydes. formatCurrency bliver, og filen har ikke truncate. Koer: npx tsx scripts/price-trends-amount-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name)
}

const src = fs.readFileSync('src/app/dashboard/pricing/pricing-client.tsx', 'utf8')
const start = src.indexOf('data-testid="price-trends-mobile"')
const end = src.indexOf('hidden md:block', start)
const mobile = src.slice(start, end)
eq('kortet findes', start > 0 && end > start, true)
eq('pris ombrydes', mobile.includes('tabular-nums font-medium break-words min-w-0" data-testid="pricing-trend-price-mobile">{formatCurrency(trend.current_price)}'), true)
eq('pris bliver', mobile.includes('formatCurrency(trend.current_price)'), true)
eq('30 dage bliver', mobile.includes('{trend.trend_30_days}%'), true)
eq('90 dage bliver', mobile.includes('{trend.trend_90_days}%'), true)
eq('navn bliver', mobile.includes('break-words min-w-0" data-testid="pricing-trend-product-mobile">{trend.product_name}'), true)
eq('ingen truncate', src.includes('truncate'), false)

console.log(fail ? '\n' + fail + ' fejl' : '\nprice-trends-amount-wrap-test OK')
process.exitCode = fail ? 1 : 0
