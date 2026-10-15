/** Sagens DB og budget ombrydes. fmtKr og grundlaget bliver. Koer: npx tsx scripts/case-economy-amount-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name)
}

const src = fs.readFileSync('src/app/dashboard/orders/[id]/order-economy-tab.tsx', 'utf8')
const start = src.indexOf('grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 min-w-0')
const end = src.indexOf('function HeroCard', start)
const block = src.slice(start, end)
eq('kortene findes', start > 0 && end > start, true)
eq('db ombrydes', block.includes('text-xl font-semibold tabular-nums break-words ${palette.text}'), true)
eq('db bliver', block.includes('fmtKr(data.totals.contribution_margin)'), true)
eq('budget ombrydes', block.includes('break-words">{fmtKr(data.budget)}'), true)
eq('kontrakt bliver', block.includes('fmtKr(data.contract_sum)'), true)
eq('kost bliver', block.includes('fmtKr(data.totals.cost)'), true)
eq('grundlag bliver', block.includes('data-testid="case-db-basis"') && block.includes("revenue_basis === 'contract'") && block.includes("revenue_basis === 'invoiced'"), true)
eq('hero ombrydes', src.includes('text-xl font-semibold text-gray-900 tabular-nums break-words'), true)
eq('realiseret ombrydes', src.includes('data-testid="realized-db-value"') && src.includes('tabular-nums break-words ${tone}'), true)
eq('realiseret bliver', src.includes('fmtKr(realized.realized_db)'), true)
eq('opdeling ombrydes', src.split('tabular-nums text-base font-semibold text-gray-900 break-words').length === 4, true)
eq('detalje ombrydes', src.includes('min-w-0 tabular-nums break-words ${r.warning'), true)
eq('opdeling db ombrydes', src.includes('tabular-nums font-medium break-words ${palette.text}'), true)
eq('db-formel bliver', src.includes('const cm = sale - cost') && src.includes('sale > 0 ? (cm / sale) * 100 : 0'), true)

console.log(fail ? '\n' + fail + ' fejl' : '\ncase-economy-amount-wrap-test OK')
process.exitCode = fail ? 1 : 0
