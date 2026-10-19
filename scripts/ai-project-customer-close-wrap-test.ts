/**
 * Luk-knappen i kundevaelgeren kan krympe. Aria-label og klik er uaendret.
 *   npx tsx scripts/ai-project-customer-close-wrap-test.ts
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
const id = 'data-testid="ai-project-customer-close"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 160, at + 80) : ''
ok(row.includes('break-words min-w-0'), 'knappen kan krympe')
ok(row.includes('aria-label="Luk"'), 'aria-label er uaendret')
ok(row.includes('shrink-0'), 'ikonet bliver fast')
ok(row.includes('setShowCustomerModal(false)'), 'klikket bliver')
ok(!row.includes('Annuller'), 'annuller er en anden knap')
ok(view.split(id).length === 2, 'knappen findes en gang')
ok(view.split('aria-label="Luk"').length === 2, 'navnet findes en gang')
ok(view.includes('data-testid="ai-project-customer-cancel"'), 'annuller bliver')
ok(view.includes('aria-label="Søg efter kunde"'), 'soegningen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  ai-project-customer-close-wrap-test')
