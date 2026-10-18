/**
 * Tælleren på prisfanerne ombrydes. Tallet og faneskiftet er uændret.
 *   npx tsx scripts/pricing-tab-count-wrap-test.ts
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
const at = view.indexOf('data-testid="pricing-tab-count"')
const row = at >= 0 ? view.slice(at - 180, at + 80) : ''
ok(row.includes('break-words min-w-0'), 'taelleren ombrydes')
ok(row.includes('{tab.count}'), 'tallet er uændret')
ok(row.includes('bg-gray-100 text-gray-600'), 'farven bliver')
ok(view.includes('{tab.count > 0 && ('), 'tom taelling skjules stadig')
ok(view.includes('setActiveTab(tab.key)'), 'faneskiftet bliver')
ok(view.includes("label: 'Prisadvarsler', count: alerts.length"), 'Prisadvarsler bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-tab-count-wrap-test')
