/**
 * Leverandørkortets overskriftsrække kan krympe. Navn og synk-dato er uændrede.
 *   npx tsx scripts/pricing-supplier-head-wrap-test.ts
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
const at = view.indexOf('data-testid="pricing-supplier-head"')
const row = at >= 0 ? view.slice(at - 140, at + 420) : ''
ok(row.includes('min-w-0 break-words'), 'raekken kan krympe')
ok(row.includes('data-testid="pricing-supplier-name"'), 'navnemaerket bliver')
ok(row.includes('{stat.supplier_name}'), 'navnet er uændret')
ok(row.includes('data-testid="pricing-sync-date"'), 'synk-maerket bliver')
ok(row.includes('Synk: {formatDateUtil(stat.last_sync_at)}'), 'synk-datoen er uændret')
ok(view.includes('formatCurrency(alert.old_price)'), 'gammel pris bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-supplier-head-wrap-test')
