/** Pristendenser kan laeses paa mobil. Priserne bliver. Koer: npx tsx scripts/price-trends-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/pricing/pricing-client.tsx', 'utf8')
const start = src.indexOf('data-testid="price-trends-mobile"')
const mobile = src.slice(start, src.indexOf('hidden md:block', start))
eq('mobilkort findes', start > 0, true)
eq('navn ombrydes', mobile.includes('break-words min-w-0" data-testid="pricing-trend-product-mobile">{trend.product_name}'), true)
eq('nuværende pris bliver', mobile.includes('formatCurrency(trend.current_price)'), true)
eq('30 dage bliver', mobile.includes('{trend.trend_30_days}%'), true)
eq('90 dage bliver', mobile.includes('{trend.trend_90_days}%'), true)
eq('tom tendens bliver', mobile.includes('trend.trend_30_days !== null') && mobile.includes('trend.trend_90_days !== null'), true)
eq('volatilitet bliver', mobile.includes('volatilityLabels[trend.volatility]'), true)
eq('antal bliver', mobile.includes('{trend.change_count_30_days}'), true)
eq('desktop-navn bliver', src.includes('font-medium break-words max-w-[16rem] min-w-0" data-testid="pricing-trend-product-name">{trend.product_name}'), true)
eq('tom leverandoer bliver', src.includes('Vælg en leverandør for at se pristendenser'), true)
eq('ingen truncate', src.includes('truncate'), false)

console.log(fail ? `\n${fail} fejl` : '\nprice-trends-mobile-test OK')
process.exitCode = fail ? 1 : 0
