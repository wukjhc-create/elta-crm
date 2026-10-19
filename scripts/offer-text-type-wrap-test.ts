/**
 * Typemærket på tilbudstekstkortet ombrydes. Etiketten er uændret.
 *   npx tsx scripts/offer-text-type-wrap-test.ts
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
const id = 'data-testid="offer-text-type"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 120, at + 80) : ''
ok(row.includes('break-words min-w-0'), 'mærket ombrydes')
ok(row.includes('{typeConfig.label}'), 'teksten er uændret')
ok(view.split('{typeConfig.label}').length === 2, 'etiketten findes en gang')
ok(view.includes('data-testid="offer-text-scope"'), 'omfangsmærket bliver')
ok(view.includes('{template.scope_id}'), 'omfang-id bliver')
ok(view.includes('data-testid="offer-text-title"'), 'titlen bliver')
ok(view.includes('Prioritet: {template.priority}'), 'prioriteten bliver')
ok(view.includes('deleteOfferTextTemplate'), 'slet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  offer-text-type-wrap-test')
