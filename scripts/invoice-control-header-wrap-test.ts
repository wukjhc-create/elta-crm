/**
 * Fakturakontrollens statuslinje ombrydes. Statusteksten er uændret.
 *   npx tsx scripts/invoice-control-header-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'app', 'dashboard', 'incoming-invoices', '[id]', 'invoice-control-panel.tsx'), 'utf8')
const start = view.indexOf('data-testid="invoice-control-header"')
const row = start >= 0 ? view.slice(start - 140, start + 80) : ''
ok(row.includes('break-words min-w-0'), 'statuslinjen ombrydes')
ok(row.includes('{header.text}'), 'statusteksten er uændret')
ok(row.includes('${headerCls}'), 'farven kommer stadig fra tonen')
ok(!row.includes('truncate'), 'statuslinjen klippes ikke')
ok(view.includes('headerLineSummary(res.header)'), 'teksten beregnes som før')
ok(view.includes("header?.tone === 'bad' ? 'text-red-700' : header?.tone === 'warn' ? 'text-amber-800' : 'text-gray-600'"), 'farverne er uændret')
ok(view.includes('data-testid="invoice-control-tolerance"'), 'tolerancen er uændret')
ok(view.includes('data-testid="invoice-control-overcharge"'), 'overprisen er uændret')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  invoice-control-header-wrap-test')
