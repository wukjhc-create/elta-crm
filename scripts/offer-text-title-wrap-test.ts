/**
 * Titlen på tilbudstekstkortet ombrydes. Teksten er uændret.
 *   npx tsx scripts/offer-text-title-wrap-test.ts
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
const id = 'data-testid="offer-text-title"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 160, at + 80) : ''
ok(row.includes('break-words min-w-0'), 'titlen ombrydes')
ok(row.includes('>{template.title}'), 'teksten er uændret')
ok(view.includes('data-testid="offer-text-content"'), 'indholdet bliver')
ok(view.includes('>{template.content}'), 'indholdsteksten bliver')
ok(view.includes('deleteOfferTextTemplate'), 'slet bliver')
ok(view.includes('aria-label="Søg i tilbudstekster"'), 'søgningen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  offer-text-title-wrap-test')
