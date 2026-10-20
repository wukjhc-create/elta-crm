/**
 * Konverteringsmaerkets skjulte tekst kan krympe. Sagsnummeret og linket bliver.
 *   npx tsx scripts/offer-conversion-sr-only-wrap-test.ts
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

const wrapped = '<span className="sr-only break-words min-w-0">{label}</span>'
const bare = '<span className="sr-only">{label}</span>'
const badge = readFileSync('src/components/modules/offers/offer-conversion-badge.tsx', 'utf8')

ok(badge.includes(wrapped), 'den skjulte tekst kan krympe')
ok(badge.split(wrapped).length === 2, 'den skjulte tekst er en')
ok(!badge.includes(bare), 'den skjulte tekst er ikke bar')
ok(badge.includes('{convertedCase.case_number}'), 'sagsnummeret bliver')
ok(badge.includes('title="Åbn sagen"'), 'titlen bliver')
ok(badge.includes('href={`/dashboard/orders/${convertedCase.case_number}`}'), 'linket bliver')
ok(badge.includes("label === 'Sag mangler'"), 'advarslen bliver')
ok(badge.includes("label === 'Klar til sag'"), 'klar-teksten bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  offer-conversion-sr-only-wrap-test')
