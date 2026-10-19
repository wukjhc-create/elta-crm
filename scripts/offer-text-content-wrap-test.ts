/**
 * Tilbudstekstens indhold på skabelonkortet ombrydes. Teksten er uændret.
 *   npx tsx scripts/offer-text-content-wrap-test.ts
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
const at = view.indexOf('data-testid="offer-text-content"')
const row = at >= 0 ? view.slice(at - 120, at + 80) : ''
ok(row.includes('break-words min-w-0'), 'indholdet ombrydes')
ok(row.includes('>{template.content}'), 'teksten er uændret')
ok(!row.includes('line-clamp-2'), 'det klippes ikke til to linjer')
ok(view.includes('{template.title}'), 'titlen bliver')
ok(view.includes('deleteOfferTextTemplate'), 'slet bliver')
ok(view.includes('aria-label="Søg i tilbudstekster"'), 'søgningen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  offer-text-content-wrap-test')
