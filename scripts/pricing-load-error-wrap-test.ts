/**
 * Fejlrammen på prisovervågning kan krympe. Teksten er uændret.
 *   npx tsx scripts/pricing-load-error-wrap-test.ts
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
const at = view.indexOf('data-testid="pricing-load-error"')
const row = at >= 0 ? view.slice(at - 140, at + 400) : ''
ok(row.includes('min-w-0'), 'rammen kan krympe')
ok(row.includes('>{message}. Det tælles ikke som ingen prisændringer.<'), 'teksten er uændret')
ok(view.includes("setAlertsError('Kunne ikke hente prisadvarsler')"), 'advarselfejlen bliver')
ok(!view.includes('setAlerts([])'), 'listen slettes ikke ved fejl')
ok(view.includes('data-testid="pricing-loading-state"'), 'indlæsningsrammen bliver')
ok(view.includes('formatCurrency(alert.old_price)'), 'gammel pris bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-load-error-wrap-test')
