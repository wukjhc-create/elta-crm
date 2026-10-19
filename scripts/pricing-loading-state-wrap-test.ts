/**
 * Indlæsningsrammen på prisovervågning kan krympe. Teksten er uændret.
 *   npx tsx scripts/pricing-loading-state-wrap-test.ts
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
const at = view.indexOf('data-testid="pricing-loading-state"')
const row = at >= 0 ? view.slice(at - 160, at + 320) : ''
ok(row.includes('min-w-0'), 'rammen kan krympe')
ok(row.includes('>Indlæser data...<'), 'teksten er uændret')
ok(view.includes('data-testid="pricing-empty-state"'), 'den tomme ramme bliver')
ok(view.includes('className="bg-white rounded-lg border p-8 text-center min-w-0" data-testid="pricing-load-error"'), 'fejlrammen kan krympe')
ok(view.includes('formatCurrency(alert.old_price)'), 'gammel pris bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-loading-state-wrap-test')
