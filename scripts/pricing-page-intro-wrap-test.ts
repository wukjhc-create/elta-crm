/**
 * Indledningen under Prisovervågning ombrydes. Sætningen er uændret.
 *   npx tsx scripts/pricing-page-intro-wrap-test.ts
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

const view = readFileSync(join('src', 'app', 'dashboard', 'pricing', 'page.tsx'), 'utf8')
const sentence = 'Spor prisændringer, identificer påvirkede tilbud og overvåg leverandørtendenser'
const at = view.indexOf('data-testid="pricing-page-intro"')
const row = at >= 0 ? view.slice(at - 80, at + 160) : ''
ok(row.includes('break-words min-w-0'), 'indledningen ombrydes')
ok(row.includes(sentence), 'sætningen er uændret')
ok(view.includes('data-testid="pricing-page-title"'), 'overskriften bliver')
ok(view.includes("pageHasPermission('economy.cost_prices')"), 'adgangstjekket bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-page-intro-wrap-test')
