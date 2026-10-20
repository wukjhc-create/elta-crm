/**
 * Mærket Klar til sag kan krympe. Teksten er uændret.
 *   npx tsx scripts/offer-conversion-ready-wrap-test.ts
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
ok(offerConversionLabel('sent', null, false) === 'Klar til sag', 'sendt er klar')
ok(offerConversionLabel('viewed', null, false) === 'Klar til sag', 'set er klar')
ok(offerConversionLabel('accepted', null, false) === 'Klar til sag', 'accepteret er klar')
ok(offerConversionLabel('draft', null, false) === null, 'kladde er tom')

const wrapped = 'className="inline-flex items-center gap-1 rounded-full bg-blue-50 ring-1 ring-blue-200 px-2 py-0.5 text-xs font-medium text-blue-700 break-words min-w-0"'
const bare = 'className="inline-flex items-center gap-1 rounded-full bg-blue-50 ring-1 ring-blue-200 px-2 py-0.5 text-xs font-medium text-blue-700"'
const badge = readFileSync('src/components/modules/offers/offer-conversion-badge.tsx', 'utf8')

ok(badge.includes(wrapped), 'maerket kan krympe')
ok(badge.split(wrapped).length === 2, 'maerket er et')
ok(!badge.includes(bare), 'maerket er ikke bart')
ok(badge.includes("label === 'Klar til sag'"), 'betingelsen bliver')
ok(badge.includes('<CircleDot className="w-3 h-3" />'), 'ikonet bliver')
ok(badge.includes('className="inline-flex items-center gap-1 rounded-full bg-emerald-50 ring-1 ring-emerald-200 px-2 py-0.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 break-words min-w-0"'), 'linket bliver')
ok(badge.includes('className="inline-flex items-center gap-1 rounded-full bg-amber-50 ring-1 ring-amber-200 px-2 py-0.5 text-xs font-medium text-amber-700 break-words min-w-0"'), 'advarslen bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  offer-conversion-ready-wrap-test')
