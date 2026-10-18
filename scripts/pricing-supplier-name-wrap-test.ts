/**
 * Leverandørnavnet på prisstatistikken ombrydes. Navnet kommer stadig fra stat.supplier_name.
 *   npx tsx scripts/pricing-supplier-name-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

const view = readFileSync(join('src', 'app', 'dashboard', 'pricing', 'pricing-client.tsx'), 'utf8')
const at = view.indexOf('data-testid="pricing-supplier-name"')
const row = at >= 0 ? view.slice(at - 80, at + 70) : ''
ok(row.includes('break-words min-w-0'), 'navnet ombrydes')
ok(row.includes('{stat.supplier_name}'), 'navnet kommer stadig fra statistikken')
ok(view.includes('formatCurrency(alert.old_price)'), 'lagrede priser bliver')
ok(view.includes('formatCurrency(alert.new_price)'), 'ny pris bliver')
ok(!view.includes('truncate'), 'siden klipper ikke')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  pricing-supplier-name-wrap-test')
