/**
 * Luk-ikonet i kundevælgeren kan krympe. aria-label Luk er uændret.
 *   npx tsx scripts/ai-project-close-icon-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { formatDate } from '../src/lib/utils'
import { formatCurrency } from '../src/lib/utils/format'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

ok(formatDate('2026-06-02').includes('2026'), 'datoen bliver')
ok(formatCurrency(1250).includes('1'), 'beloebsformatet bliver')

const view = readFileSync('src/app/dashboard/ai-project/ai-project-client.tsx', 'utf8')
const id = 'data-testid="ai-project-close-icon"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 48, at + 40) : ''
const cell = 'className="w-5 h-5 break-words min-w-0" data-testid="ai-project-close-icon"'
ok(row.includes('w-5 h-5 break-words min-w-0'), 'lukikonet kan krympe')
ok(row.includes('<X'), 'det er lukikonet')
ok(!row.includes('Vælg kunde'), 'teksten er et andet sted')
ok(!row.includes('formatCurrency'), 'priserne er et andet sted')
ok(!row.includes('aria-label="Luk"'), 'aria-label er et andet sted')
ok(view.split(id).length === 2, 'ikonet findes en gang')
ok(view.split(cell).length === 2, 'ikonklassen findes en gang')
ok(!view.includes('<X className="w-5 h-5" />'), 'det bare ikon er vaek')
ok(view.split('aria-label="Luk"').length === 2, 'aria-label findes en gang')
ok(view.split('>Vælg kunde<').length === 2, 'teksten findes en gang')
ok(view.includes('formatCurrency(result.calculation.price.total_price)'), 'totalprisen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-close-icon-wrap-test')
