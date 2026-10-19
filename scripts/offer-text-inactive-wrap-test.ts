/**
 * Inaktiv-mærket på tilbudstekstkortet ombrydes. Teksten er uændret.
 *   npx tsx scripts/offer-text-inactive-wrap-test.ts
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
const id = 'data-testid="offer-text-inactive"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 80) : ''
ok(row.includes('break-words min-w-0'), 'mærket ombrydes')
ok(row.includes('Inaktiv'), 'teksten er uændret')
ok(view.split('Inaktiv').length === 2, 'teksten findes en gang')
ok(view.includes('data-testid="offer-text-priority"'), 'prioriteten bliver')
ok(view.includes('Prioritet: {template.priority}'), 'prioritetsteksten bliver')
ok(view.includes('Betingelser: {JSON.stringify(template.conditions)}'), 'betingelsen venter')
ok(view.includes('deleteOfferTextTemplate'), 'slet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  offer-text-inactive-wrap-test')
