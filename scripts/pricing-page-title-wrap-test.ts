/**
 * Overskriften Prisovervågning ombrydes. Titlen og adgangstjekket er uændret.
 *   npx tsx scripts/pricing-page-title-wrap-test.ts
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
const at = view.indexOf('data-testid="pricing-page-title"')
const row = at >= 0 ? view.slice(at - 80, at + 80) : ''
ok(row.includes('break-words min-w-0'), 'overskriften ombrydes')
ok(row.includes('>Prisovervågning<'), 'ordet bliver')
ok(view.includes("title: 'Prisovervågning'"), 'dokumenttitlen bliver')
ok(view.includes("pageHasPermission('economy.cost_prices')"), 'adgangstjekket bliver')
ok(view.includes('Spor prisændringer, identificer påvirkede tilbud og overvåg leverandørtendenser'), 'indledningen bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-page-title-wrap-test')
