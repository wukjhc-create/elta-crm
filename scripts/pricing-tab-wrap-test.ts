/**
 * Fanerne på prissiden ombrydes. Ordene og tællingerne er uændret.
 *   npx tsx scripts/pricing-tab-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { formatDate } from '../src/lib/utils'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

ok(formatDate('2026-06-02').includes('2026'), 'datoformatering bliver')

const view = readFileSync(join('src', 'app', 'dashboard', 'pricing', 'pricing-client.tsx'), 'utf8')
const at = view.indexOf('data-testid="pricing-tab"')
const row = at >= 0 ? view.slice(at - 400, at + 280) : ''
ok(row.includes('break-words min-w-0'), 'fanen ombrydes')
ok(row.includes('{tab.label}'), 'ordet kommer stadig fra tab.label')
ok(row.includes('{tab.count}'), 'taellingen kommer stadig fra tab.count')
ok(row.includes('setActiveTab(tab.key)'), 'handlingen er uændret')
ok(view.includes("label: 'Prisadvarsler', count: alerts.length"), 'Prisadvarsler bliver')
ok(view.includes("label: 'Påvirkede tilbud', count: affectedOffers.length"), 'Påvirkede tilbud bliver')
ok(view.includes("label: 'Leverandørstatistik', count: supplierStats.length"), 'Leverandørstatistik bliver')
ok(view.includes("label: 'Pristendenser', count: trends.length"), 'Pristendenser bliver')
ok(view.includes('border-blue-600 text-blue-600'), 'valgt fane bliver')
ok(view.includes('>Tærskel:<'), 'taerskeletiketten bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-tab-wrap-test')
