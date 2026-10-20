/**
 * Konverteringslinket kan krympe. Sagsnummeret og href er uændrede.
 *   npx tsx scripts/offer-conversion-link-wrap-test.ts
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
ok(offerConversionLabel('sent', 'case-1', true) === 'Konverteret', 'teksten bliver Konverteret')

const wrapped = 'className="inline-flex items-center gap-1 rounded-full bg-emerald-50 ring-1 ring-emerald-200 px-2 py-0.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 break-words min-w-0"'
const bare = 'className="inline-flex items-center gap-1 rounded-full bg-emerald-50 ring-1 ring-emerald-200 px-2 py-0.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"'
const badge = readFileSync('src/components/modules/offers/offer-conversion-badge.tsx', 'utf8')

ok(badge.includes(wrapped), 'linket kan krympe')
ok(badge.split(wrapped).length === 2, 'linket er et')
ok(!badge.includes(bare), 'linket er ikke bart')
ok(badge.includes('{convertedCase.case_number}'), 'sagsnummeret bliver')
ok(badge.includes('href={`/dashboard/orders/${convertedCase.case_number}`}'), 'href bliver')
ok(badge.includes('title="Åbn sagen"'), 'titlen bliver')
ok(badge.includes('<span className="sr-only break-words min-w-0">{label}</span>'), 'den skjulte tekst bliver')
ok(badge.includes('className="inline-flex items-center gap-1 rounded-full bg-amber-50 ring-1 ring-amber-200 px-2 py-0.5 text-xs font-medium text-amber-700"'), 'advarslen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  offer-conversion-link-wrap-test')
