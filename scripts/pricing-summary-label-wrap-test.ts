/**
 * Etiketterne på prisoversigtens kort ombrydes. Tallene er uændret.
 *   npx tsx scripts/pricing-summary-label-wrap-test.ts
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
const at = view.indexOf('data-testid="pricing-summary-label"')
const row = at >= 0 ? view.slice(at - 80, at + 50) : ''
ok(row.includes('break-words min-w-0'), 'etiketten ombrydes')
ok(row.includes('>{label}<'), 'etiketten kommer stadig fra label')
ok(view.includes('{isText ? value : value}'), 'tallet er uændret')
ok(view.includes('label="Kritiske advarsler"'), 'Kritiske advarsler bliver')
ok(view.includes('value={summary.criticalAlerts}'), 'kritiske tal bliver')
ok(view.includes('label="Prisændringer total"'), 'Prisændringer total bliver')
ok(view.includes('value={summary.totalAlerts}'), 'totalen bliver')
ok(view.includes('label="Prisstigninger"'), 'Prisstigninger bliver')
ok(view.includes('value={summary.priceIncreases}'), 'stigninger bliver')
ok(view.includes('label="Påvirkede tilbud"'), 'Påvirkede tilbud bliver')
ok(view.includes('value={summary.affectedOffers}'), 'påvirkede tal bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-summary-label-wrap-test')
