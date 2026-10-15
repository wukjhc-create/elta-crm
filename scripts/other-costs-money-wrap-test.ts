/** Oevrige omkostningers beloeb ombrydes i kortet. Kost-gate og formler bliver. Koer: npx tsx scripts/other-costs-money-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/orders/[id]/order-other-costs-tab.tsx', 'utf8')
const mobile = src.slice(src.indexOf('data-testid="other-costs-mobile"'), src.indexOf('hidden md:block bg-white rounded-lg ring-1 ring-gray-200 overflow-x-auto'))
const grid = mobile.slice(mobile.indexOf('<dl'), mobile.indexOf('</dl>'))
eq('gitteret kan krympe', grid.includes('grid grid-cols-2 gap-x-3 gap-y-1 text-xs min-w-0'), true)
eq('fire celler kan krympe', grid.split('className="min-w-0"').length - 1, 4)
eq('fire beloeb ombrydes', grid.split('text-gray-900 break-words').length - 1, 4)
eq('salg bliver', grid.includes("formatCurrency(r.unit_sales_price, 'DKK', 2)") && grid.includes("formatCurrency(r.total_sales_price, 'DKK', 2)"), true)
eq('kost bliver', grid.includes("formatCurrency(r.unit_cost, 'DKK', 2)") && grid.includes("formatCurrency(r.total_cost, 'DKK', 2)"), true)
eq('kost kraever showCost', grid.indexOf('formatCurrency(r.unit_cost') > grid.indexOf('{showCost && ('), true)
eq('sum ombrydes', mobile.includes('min-w-0 break-words text-right">{formatCurrency(summary.total_sales_price, \'DKK\', 2)}'), true)
eq('db bliver', mobile.includes('formatCurrency(summary.contribution_margin, \'DKK\', 2)') && mobile.includes('fmtPct(summary.margin_percentage)'), true)
eq('db-testid ligger ikke paa kortet', mobile.includes('other-costs-db-row'), false)
eq('noten klippes ikke', src.includes('truncate'), false)

console.log(fail ? `\n${fail} fejl` : '\nother-costs-money-wrap-test OK')
process.exitCode = fail ? 1 : 0
