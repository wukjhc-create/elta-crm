/**
 * Prioritetsmærket på tilbudstekstkortet ombrydes. Teksten er uændret.
 *   npx tsx scripts/offer-text-priority-wrap-test.ts
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
ok(formatCurrency(1250).includes('1'), 'beløbsformatet bliver')

const view = readFileSync('src/app/dashboard/settings/kalkia/texts/offer-texts-client.tsx', 'utf8')
const id = 'data-testid="offer-text-priority"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 120, at + 140) : ''
ok(row.includes('break-words min-w-0'), 'mærket ombrydes')
ok(row.includes('Prioritet: {template.priority}'), 'teksten er uændret')
ok(view.split('Prioritet: {template.priority}').length === 2, 'teksten findes en gang')
ok(view.includes('data-testid="offer-text-type"'), 'typemærket bliver')
ok(view.includes('{typeConfig.label}'), 'typeetiketten bliver')
ok(view.includes('data-testid="offer-text-scope"'), 'omfangsmærket bliver')
ok(view.includes('data-testid="offer-text-inactive"'), 'inaktiv-mærket bliver')
ok(view.includes('deleteOfferTextTemplate'), 'slet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  offer-text-priority-wrap-test')
