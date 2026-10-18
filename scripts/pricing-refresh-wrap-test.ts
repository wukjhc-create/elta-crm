/**
 * Knappen Opdater på prissiden ombrydes. Ordet og loadData er uændret.
 *   npx tsx scripts/pricing-refresh-wrap-test.ts
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
const at = view.indexOf('data-testid="pricing-refresh"')
const row = at >= 0 ? view.slice(at - 220, at + 180) : ''
ok(row.includes('break-words min-w-0'), 'knappen ombrydes')
ok(row.includes('onClick={loadData}'), 'handlingen er uændret')
ok(row.includes('Opdater'), 'ordet er uændret')
ok(row.includes("isLoading ? 'animate-spin' : ''"), 'spinneren bliver')
ok(view.includes('data-testid="pricing-tab"'), 'fanen bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-refresh-wrap-test')
