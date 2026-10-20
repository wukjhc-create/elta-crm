/**
 * Advarslen Sag mangler kan krympe. Teksten og titlen er uændrede.
 *   npx tsx scripts/offer-conversion-missing-case-wrap-test.ts
 */
import { readFileSync } from 'node:fs'
import { offerConversionLabel } from '../src/lib/offers/conversion-label'
import { formatDate } from '../src/lib/utils'
import { formatCurrency } from '../src/lib/utils/format'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

ok(formatDate('2026-06-02').includes('2026'), 'datoen bliver')
ok(formatCurrency(1250).includes('1'), 'beloebsformatet bliver')
ok(offerConversionLabel('accepted', 'case-1', false) === 'Sag mangler', 'teksten bliver Sag mangler')

const wrapped = 'className="inline-flex items-center gap-1 rounded-full bg-amber-50 ring-1 ring-amber-200 px-2 py-0.5 text-xs font-medium text-amber-700 break-words min-w-0"'
const bare = 'className="inline-flex items-center gap-1 rounded-full bg-amber-50 ring-1 ring-amber-200 px-2 py-0.5 text-xs font-medium text-amber-700"'
const badge = readFileSync('src/components/modules/offers/offer-conversion-badge.tsx', 'utf8')

ok(badge.includes(wrapped), 'advarslen kan krympe')
ok(badge.split(wrapped).length === 2, 'advarslen er en')
ok(!badge.includes(bare), 'advarslen er ikke bar')
ok(badge.includes("label === 'Sag mangler'"), 'betingelsen bliver')
ok(badge.includes('title="Tilbuddet er markeret som konverteret, men sagen kan ikke findes (måske slettet)."'), 'titlen bliver')
ok(badge.includes('{label}'), 'teksten bliver')
ok(badge.includes('className="inline-flex items-center gap-1 rounded-full bg-emerald-50 ring-1 ring-emerald-200 px-2 py-0.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 break-words min-w-0"'), 'linket bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  offer-conversion-missing-case-wrap-test')
