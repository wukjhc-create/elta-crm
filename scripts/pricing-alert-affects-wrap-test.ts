/**
 * Antallet ved påvirkede tilbud og kalkulationer ombrydes. Tallene er uændret.
 *   npx tsx scripts/pricing-alert-affects-wrap-test.ts
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
const checks: Array<[string, string]> = [
  ['pricing-alert-affects-mobile', 'Tilbud {alert.affects_offers} · kalkulationer {alert.affects_calculations}'],
  ['pricing-alert-affects-offers', '{alert.affects_offers}'],
  ['pricing-alert-affects-calc', '{alert.affects_calculations}'],
]
for (const [id, word] of checks) {
  const at = view.indexOf(`data-testid="${id}"`)
  const row = at >= 0 ? view.slice(at - 90, at + 200) : ''
  ok(row.includes('break-words min-w-0'), `${id} ombrydes`)
  ok(row.includes(word), `${id} tallet er uændret`)
}
ok(view.includes('alert.affects_offers > 0'), 'tilbuds-betingelsen bliver')
ok(view.includes('alert.affects_calculations > 0'), 'kalkule-betingelsen bliver')
ok(view.includes('alert.affects_offers === 0 && alert.affects_calculations === 0'), 'nul-betingelsen bliver')
ok(view.includes('data-testid="pricing-alert-change"'), 'procenten bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-alert-affects-wrap-test')
