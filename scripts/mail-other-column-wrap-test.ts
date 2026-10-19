/**
 * Tekstkolonnen i andre mailforslag kan krympe. Navnet bliver.
 * Kolonnen i e-mail-match bliver.
 *   npx tsx scripts/mail-other-column-wrap-test.ts
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
ok(formatCurrency(1250).includes('1'), 'beloebsformatet bliver')

const view = readFileSync('src/app/dashboard/mail/components/mail-detail.tsx', 'utf8')
const id = 'data-testid="mail-other-column"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 44, at + 10) : ''
const bare = '<div className="flex-1 min-w-0">'
const cell = '<div className="flex-1 min-w-0 break-words" data-testid="mail-other-column">'
ok(row.includes('<div'), 'det er kolonnen')
ok(row.includes('break-words'), 'kolonnen kan krympe')
ok(!row.includes('company_name'), 'navnet er et andet sted')
ok(!row.includes('s.id'), 'noeglen er et andet sted')
ok(!row.includes('Kobl'), 'teksten er et andet sted')
ok(!row.includes('detectedCustomer'), 'match-kunden er et andet sted')
ok(!row.includes('mail-other-name'), 'navne-id er et andet sted')
ok(!row.includes('\n'), 'kortet er et andet sted')
ok(view.split(id).length === 2, 'kolonnen findes en gang')
ok(view.split(cell).length === 2, 'kolonneklassen findes en gang')
ok(view.split(bare).length === 1, 'ingen bar kolonne bliver')
ok(view.includes('data-testid="mail-match-column"'), 'e-mail-kolonnen bliver')
ok(view.includes('data-testid="mail-other-name"'), 'navnet bliver')
ok(view.includes('{s.company_name}'), 'forslagsnavnet bliver')
ok(view.includes('{detectedCustomer.company_name}'), 'match-navnet bliver')
ok(view.includes('key={s.id}'), 'noeglen bliver')
ok(view.includes('data-testid="mail-suggest-other"'), 'forslag-kortet bliver')
ok(view.includes('data-testid="mail-suggest-match"'), 'match-kortet bliver')
ok(view.split('data-testid="mail-other-name"').length === 2, 'navne-id kolliderer ikke')
ok(view.split('data-testid="mail-other-number"').length === 2, 'nummer-id kolliderer ikke')
ok(view.split('data-testid="mail-other-kobl-icon"').length === 2, 'kobl-id kolliderer ikke')
const matchAt = view.indexOf('data-testid="mail-suggest-match"')
const otherAt = view.indexOf('data-testid="mail-suggest-other"')
const between = matchAt >= 0 && otherAt > matchAt ? view.slice(matchAt, otherAt) : ''
ok(between.includes('data-testid="mail-match-column"'), 'e-mail-kolonnen er i match-kortet')
ok(!between.includes(bare), 'match-kortet har ingen bar kolonne')
ok(!between.includes(id), 'forslag-kolonnen er et andet sted')
ok(view.includes('data-testid="mail-match-kobl-icon"'), 'match-ikonet bliver')
ok(view.includes('data-testid="mail-other-kobl-icon"'), 'forslag-ikonet bliver')
ok(view.includes('data-testid="mail-body-loading"'), 'indlaesningen bliver')
ok(view.includes('data-testid="mail-create-offer"'), 'opret-tilbud bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-other-column-wrap-test')
