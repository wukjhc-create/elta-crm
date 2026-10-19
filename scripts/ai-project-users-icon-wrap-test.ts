/**
 * Kundeikonet i kundevælgeren kan krympe. Teksten Vælg kunde er uændret.
 *   npx tsx scripts/ai-project-users-icon-wrap-test.ts
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
const id = 'data-testid="ai-project-users-icon"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 40) : ''
const cell = 'className="w-5 h-5 text-purple-500 shrink-0 break-words min-w-0" data-testid="ai-project-users-icon"'
ok(row.includes('w-5 h-5 text-purple-500 shrink-0 break-words min-w-0'), 'kundeikonet kan krympe')
ok(row.includes('<Users'), 'det er kundeikonet')
ok(row.includes('shrink-0'), 'ikonet bliver fast')
ok(!row.includes('Vælg kunde'), 'teksten er et andet sted')
ok(!row.includes('formatCurrency'), 'priserne er et andet sted')
ok(!row.includes('aria-label="Luk"'), 'luk er et andet sted')
ok(view.split(id).length === 2, 'ikonet findes en gang')
ok(view.split(cell).length === 2, 'ikonklassen findes en gang')
ok(!view.includes('<Users className="w-5 h-5 text-purple-500 shrink-0" />'), 'det bare ikon er vaek')
ok(view.split('>Vælg kunde<').length === 2, 'teksten findes en gang')
ok(view.includes('aria-label="Luk"'), 'luk bliver')
ok(view.includes('<X className="w-5 h-5 break-words min-w-0" data-testid="ai-project-close-icon" />'), 'lukikonet bliver')
ok(view.includes('formatCurrency(result.calculation.price.total_price)'), 'totalprisen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-users-icon-wrap-test')
