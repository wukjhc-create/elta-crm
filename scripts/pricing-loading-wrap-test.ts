/**
 * Teksten "Indlæser data..." på prissiden ombrydes. Sætningen er uændret.
 *   npx tsx scripts/pricing-loading-wrap-test.ts
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
const at = view.indexOf('data-testid="pricing-loading-text"')
const row = at >= 0 ? view.slice(at - 80, at + 60) : ''
ok(row.includes('break-words min-w-0'), 'teksten ombrydes')
ok(row.includes('>Indlæser data...<'), 'sætningen er uændret')
ok(view.includes('animate-spin mx-auto text-gray-400'), 'spinneren bliver')
ok(view.includes('data-testid="pricing-ministat-label"'), 'statistiketiketten bliver')
ok(view.includes('Det tælles ikke som ingen prisændringer.'), 'fejlteksten bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-loading-wrap-test')
