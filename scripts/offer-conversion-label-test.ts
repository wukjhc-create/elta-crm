/**
 * Ren konverteringstekst for tilbud. Ikke leads og ikke opfoelgning.
 *   npx tsx scripts/offer-conversion-label-test.ts
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
ok(offerConversionLabel('rejected', null, false) === null, 'afvist er tom')
ok(offerConversionLabel('expired', null, false) === null, 'udloebet er tom')
ok(offerConversionLabel('sent', 'case-1', true) === 'Konverteret', 'sag giver konverteret')
ok(offerConversionLabel('accepted', 'case-1', false) === 'Sag mangler', 'manglende sag siger det')
ok(offerConversionLabel(null, null, false) === null, 'uden status er tom')
ok(offerConversionLabel('outstanding', null, false) === null, 'ingen ny status')

const badge = readFileSync('src/components/modules/offers/offer-conversion-badge.tsx', 'utf8')
ok(badge.includes('offerConversionLabel(status, convertedCaseId, Boolean(convertedCase))'), 'maerket bruger teksten')
ok(badge.includes('<span className="sr-only break-words min-w-0">{label}</span>'), 'konverteret hoeres og kan krympe')
ok(badge.includes('{convertedCase.case_number}'), 'sagsnummeret bliver')
ok(badge.includes('title="Åbn sagen"'), 'titlen bliver')
ok(!badge.includes('follow-up'), 'maerket er ikke opfoelgning')

const leads = readFileSync('src/components/modules/leads/leads-page-client.tsx', 'utf8')
const detail = readFileSync('src/app/dashboard/leads/[id]/lead-detail-client.tsx', 'utf8')
const follow = readFileSync('src/lib/followup/offer-followup.ts', 'utf8')
ok(!leads.includes('offerConversionLabel'), 'leadlisten har ikke teksten')
ok(!detail.includes('offerConversionLabel'), 'leaddetaljen har ikke teksten')
ok(!follow.includes('offerConversionLabel'), 'opfoelgningen har ikke teksten')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  offer-conversion-label-test')
