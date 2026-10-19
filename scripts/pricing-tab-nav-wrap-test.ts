/**
 * Fanerækken på prisovervågning kan ombrydes. Faneteksterne er uændrede.
 *   npx tsx scripts/pricing-tab-nav-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { formatCurrency } from '../src/lib/utils/format'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

ok(formatCurrency(1250).includes('1'), 'beløbsformatet bliver')

const view = readFileSync(join('src', 'app', 'dashboard', 'pricing', 'pricing-client.tsx'), 'utf8')
const at = view.indexOf('data-testid="pricing-tab-nav"')
const row = at >= 0 ? view.slice(at - 80, at + 1100) : ''
ok(row.includes('flex-wrap min-w-0'), 'raekken kan ombrydes')
ok(row.includes("label: 'Prisadvarsler'"), 'Prisadvarsler bliver')
ok(row.includes("label: 'Påvirkede tilbud'"), 'Påvirkede tilbud bliver')
ok(row.includes("label: 'Leverandørstatistik'"), 'Leverandørstatistik bliver')
ok(row.includes("label: 'Pristendenser'"), 'Pristendenser bliver')
ok(row.includes('data-testid="pricing-tab"'), 'fanen bliver')
ok(row.includes('setActiveTab(tab.key)'), 'handlingen er uændret')
ok(view.includes('formatCurrency(alert.old_price)'), 'gammel pris bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-tab-nav-wrap-test')
