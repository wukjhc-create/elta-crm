/** Prisadvarsler kan laeses paa mobil. Priserne bliver. Koer: npx tsx scripts/price-alerts-mobile-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/pricing/pricing-client.tsx', 'utf8')
const start = src.indexOf('data-testid="price-alerts-mobile"')
const mobile = src.slice(start, src.indexOf('hidden md:block', start))
eq('mobilkort findes', start > 0, true)
eq('navn ombrydes', mobile.includes('break-words">{alert.product_name}'), true)
eq('gammel pris bliver', mobile.includes('formatCurrency(alert.old_price)'), true)
eq('ny pris bliver', mobile.includes('formatCurrency(alert.new_price)'), true)
eq('aendring bliver', mobile.includes('alert.change_percentage.toFixed(1)'), true)
eq('taerskel bliver', mobile.includes('Math.abs(alert.change_percentage) >= 10') && mobile.includes('Math.abs(alert.change_percentage) >= 5'), true)
eq('dato bliver', mobile.includes('formatDateUtil(alert.changed_at)'), true)
eq('paavirkning bliver', mobile.includes('{alert.affects_offers}') && mobile.includes('{alert.affects_calculations}'), true)
eq('desktop-navn bliver', src.includes('font-medium break-words max-w-[16rem]">{alert.product_name}'), true)
eq('ingen truncate', src.includes('truncate'), false)
eq('desktop-tabel bliver', src.slice(start).includes('hidden md:block'), true)

console.log(fail ? `\n${fail} fejl` : '\nprice-alerts-mobile-test OK')
process.exitCode = fail ? 1 : 0
