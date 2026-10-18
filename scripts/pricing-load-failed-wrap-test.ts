/**
 * Fejlteksten på prissiden ombrydes. Sætningen er uændret.
 *   npx tsx scripts/pricing-load-failed-wrap-test.ts
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
const at = view.indexOf('data-testid="pricing-load-failed-text"')
const row = at >= 0 ? view.slice(at - 80, at + 120) : ''
ok(row.includes('break-words min-w-0'), 'fejlteksten ombrydes')
ok(row.includes('>{message}. Det tælles ikke som ingen prisændringer.<'), 'sætningen er uændret')
ok(view.includes('data-testid="pricing-load-error"'), 'fejlmarkeringen bliver')
ok(view.includes("setAlertsError('Kunne ikke hente prisadvarsler')"), 'advarselfejlen bliver')
ok(!view.includes('setAlerts([])'), 'listen slettes ikke ved fejl')
ok(view.includes('data-testid="pricing-empty-text"'), 'den tomme tekst bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-load-failed-wrap-test')
