/** Laaste tilbudslinjers beloeb ombrydes. formatCurrency og kost-gaten bliver. Koer: npx tsx scripts/line-items-amount-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name)
}

const src = fs.readFileSync('src/components/shared/line-items-table.tsx', 'utf8')
const start = src.indexOf('data-testid="line-items-mobile"')
const end = src.indexOf('hidden md:block', start)
const mobile = src.slice(start, end)
eq('kortet findes', start > 0 && end > start, true)
eq('total ombrydes', mobile.includes('break-words">{formatCurrency(item.total, currency, 2)}'), true)
eq('enhedslinje ombrydes', mobile.includes('text-xs tabular-nums text-gray-600 break-words'), true)
eq('kost ombrydes', mobile.includes('text-xs tabular-nums text-gray-500 break-words'), true)
eq('enhedspris bliver', mobile.includes('formatCurrency(item.unit_price, currency, 2)'), true)
eq('antal bliver', mobile.includes('{item.quantity}'), true)
eq('enhed bliver', mobile.includes("{item.unit || 'stk'}"), true)
eq('kost-gate bliver', mobile.includes('{showCostData && ('), true)
eq('kost-fallback bliver', mobile.includes('item.cost_price || item.supplier_cost_price_at_creation || null'), true)
eq('ingen shrink-0', mobile.includes('shrink-0'), false)

console.log(fail ? '\n' + fail + ' fejl' : '\nline-items-amount-wrap-test OK')
process.exitCode = fail ? 1 : 0
