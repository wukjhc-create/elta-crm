/** Sagsrentabilitetens beloeb ombrydes i kortet. Formlerne bliver. Koer: npx tsx scripts/report-profit-money-wrap-test.ts */
import fs from 'fs'

let fail = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  fik=${JSON.stringify(got)}`}`)
}

const src = fs.readFileSync('src/app/dashboard/reports/reports-client.tsx', 'utf8')
const mobile = src.slice(src.indexOf('data-testid="report-profit-mobile"'), src.indexOf('hidden md:block overflow-x-auto', src.indexOf('data-testid="report-profit-mobile"')))
const grid = mobile.slice(mobile.indexOf('<dl'), mobile.indexOf('</dl>'))
eq('gitteret kan krympe', grid.includes('grid grid-cols-2 gap-x-3 gap-y-1 text-xs min-w-0'), true)
eq('seks celler kan krympe', grid.split('className="min-w-0"').length - 1, 6)
eq('seks beloeb ombrydes', grid.split('break-words').length - 1, 6)
eq('budget-gate bliver', grid.includes('p.budget ? formatCurrency(p.budget)'), true)
eq('kost bliver', grid.includes('formatCurrency(p.offered_cost)') && grid.includes('formatCurrency(p.actual_cost)'), true)
eq('afvigelse bliver', grid.includes("formatCurrency(p.cost_deviation)}` : 'Kan ikke beregnes'"), true)
eq('db bliver', grid.includes("p.realized_db == null ? 'Kan ikke beregnes' :"), true)
eq('netto bliver', grid.includes('p.net_invoiced ? formatCurrency(p.net_invoiced)'), true)
eq('kost kraever costOpen', mobile.indexOf('{costOpen && (') >= 0 && mobile.indexOf('{costOpen && (') < mobile.indexOf('<dl'), true)
eq('desktop-testid ligger ikke paa kortet', mobile.includes('report-case-realized') || mobile.includes('report-case-deviation'), false)

console.log(fail ? `\n${fail} fejl` : '\nreport-profit-money-wrap-test OK')
process.exitCode = fail ? 1 : 0
