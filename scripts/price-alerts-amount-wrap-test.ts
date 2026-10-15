/** Prisadvarslens gamle og nye pris ombrydes. formatCurrency og graenserne bliver. Koer: npx tsx scripts/price-alerts-amount-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name)
}

const src = fs.readFileSync('src/app/dashboard/pricing/pricing-client.tsx', 'utf8')
const start = src.indexOf('data-testid="price-alerts-mobile"')
const end = src.indexOf('hidden md:block', start)
const mobile = src.slice(start, end)
eq('kortet findes', start > 0 && end > start, true)
eq('gammel ombrydes', mobile.includes('text-xs tabular-nums text-gray-500 break-words'), true)
eq('ny ombrydes', mobile.includes('text-xs tabular-nums font-medium text-gray-900 break-words'), true)
eq('gammel bliver', mobile.includes('formatCurrency(alert.old_price)'), true)
eq('ny bliver', mobile.includes('formatCurrency(alert.new_price)'), true)
eq('graense 10 bliver', mobile.includes('Math.abs(alert.change_percentage) >= 10'), true)
eq('graense 5 bliver', mobile.includes('Math.abs(alert.change_percentage) >= 5'), true)
eq('procent bliver', mobile.includes('alert.change_percentage.toFixed(1)'), true)
eq('ingen truncate', src.includes('truncate'), false)

console.log(fail ? '\n' + fail + ' fejl' : '\nprice-alerts-amount-wrap-test OK')
process.exitCode = fail ? 1 : 0
