/** Pakkelistens kost, salg og DB ombrydes. formatCurrency, 0-kost og taersklerne bliver. Koer: npx tsx scripts/package-list-amount-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name)
}

const src = fs.readFileSync('src/app/dashboard/packages/packages-client.tsx', 'utf8')
const start = src.indexOf('>Kostpris<')
const end = src.indexOf('formatCurrency(pkg.db_amount)', start)
const block = src.slice(start, end + 'formatCurrency(pkg.db_amount)'.length)
eq('kortet findes', start > 0 && end > start, true)
eq('kost ombrydes', block.includes('min-w-0 break-words">{formatCurrency(pkg.total_cost_price)}'), true)
eq('salg ombrydes', block.includes('font-medium min-w-0 break-words">{formatCurrency(pkg.total_sale_price)}'), true)
eq('db ombrydes', block.includes('min-w-0 break-words ${pkg.db_percentage >= 30'), true)
eq('taerskel 30 bliver', block.includes('pkg.db_percentage >= 30'), true)
eq('taerskel 20 bliver', block.includes('pkg.db_percentage >= 20'), true)
eq('db-procent bliver', src.includes('pkg.db_percentage.toFixed(1)'), true)
eq('navn bliver', src.includes('font-semibold break-words pr-8">{pkg.name}'), true)

const action = fs.readFileSync('src/lib/actions/packages.ts', 'utf8')
eq('0-kost bliver', action.includes('total_cost_price: 0, db_amount: 0, db_percentage: 0'), true)
eq('kost-gate bliver', action.includes("hasPermission('offers.view.cost_prices')"), true)

console.log(fail ? '\n' + fail + ' fejl' : '\npackage-list-amount-wrap-test OK')
process.exitCode = fail ? 1 : 0
