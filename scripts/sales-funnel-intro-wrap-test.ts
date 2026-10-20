/**
 * Salgstragtens indledning ombrydes. Satser, pct og reports.ts bliver.
 *   npx tsx scripts/sales-funnel-intro-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { formatDate } from '../src/lib/utils'
import { formatCurrency } from '../src/lib/utils/format'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

ok(formatDate('2026-06-02').includes('2026'), 'datoen bliver')
ok(formatCurrency(1250).includes('1'), 'beloebsformatet bliver')

const table = readFileSync('src/app/dashboard/reports/sales-funnel-table.tsx', 'utf8')
const intro = '<p className="text-xs text-gray-500 mb-4 break-words min-w-0">'
ok(table.includes(intro), 'indledningen ombrydes')
ok(table.split(intro).length === 2, 'kun indledningen har den klasse')
ok(table.includes('Sendt-rate {pct(t.sent_rate)} af oprettede tilbud · vinderrate {pct(t.win_rate)} af sendte.'), 'teksten bruger stadig pct')
ok(table.includes("const pct = (n: number | null) => (n == null ? '—' : `${n.toLocaleString('da-DK', { maximumFractionDigits: 1 })} %`)"), 'pct bliver')
ok(table.includes('funnelMonthRates(m)'), 'maanedens satser bliver')
ok(table.includes('<h3 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">'), 'overskriften er ikke ombrudt her')

const reports = readFileSync('src/lib/actions/reports.ts', 'utf8')
ok(reports.includes('export async function getSalesFunnel(months: number = 6)'), 'hentningen bliver')
ok(!reports.includes('text-xs text-gray-500 mb-4 break-words min-w-0'), 'reports.ts har ikke indledningen')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  sales-funnel-intro-wrap-test')
