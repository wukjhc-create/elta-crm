/**
 * Tekstkolonnen i e-mail-match kan krympe. Navnet bliver.
 * Kolonnen i andre forslag bliver.
 *   npx tsx scripts/mail-match-column-wrap-test.ts
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
const id = 'data-testid="mail-match-column"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 44, at + 10) : ''
const bare = '<div className="flex-1 min-w-0">'
const cell = '<div className="flex-1 min-w-0 break-words" data-testid="mail-match-column">'
const other = '<div className="flex-1 min-w-0 break-words" data-testid="mail-other-column">'
const button = 'className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"'
ok(row.includes('<div'), 'det er kolonnen')
ok(row.includes('break-words'), 'kolonnen kan krympe')
ok(!row.includes('company_name'), 'navnet er et andet sted')
ok(!row.includes('detectedCustomer'), 'kunden er et andet sted')
ok(!row.includes('s.id'), 'forslaget er et andet sted')
ok(!row.includes('Kobl'), 'teksten er et andet sted')
ok(!row.includes('mail-match-name'), 'navne-id er et andet sted')
ok(!row.includes('\n'), 'kortet er et andet sted')
ok(view.split(id).length === 2, 'kolonnen findes en gang')
ok(view.split(cell).length === 2, 'kolonneklassen findes en gang')
ok(view.split(other).length === 2, 'forslag-kolonnen bliver')
ok(view.split(bare).length === 1, 'ingen bar kolonne bliver')
ok(view.includes('{detectedCustomer.company_name}'), 'match-navnet bliver')
ok(view.includes('{s.company_name}'), 'forslagsnavnet bliver')
ok(view.includes('data-testid="mail-match-name"'), 'navnet bliver')
ok(view.includes('data-testid="mail-suggest-match"'), 'match-kortet bliver')
ok(view.includes('data-testid="mail-suggest-other"'), 'forslag-kortet bliver')
ok(view.includes('onLinkToCustomer?.(detectedCustomer.id)'), 'match-kaldet bliver')
ok(view.includes('onLinkToCustomer?.(s.id)'), 'forslag-kaldet bliver')
ok(view.split('data-testid="mail-match-name"').length === 2, 'navne-id kolliderer ikke')
ok(view.split('data-testid="mail-match-number"').length === 2, 'nummer-id kolliderer ikke')
ok(view.split('data-testid="mail-match-kobl-icon"').length === 2, 'kobl-id kolliderer ikke')
ok(view.split('data-testid="mail-other-column"').length === 2, 'anden kolonne kolliderer ikke')
ok(view.split(button).length === 1, 'ingen bar knap bliver')
ok(view.includes('data-testid="mail-match-kobl-button"'), 'e-mail-knappen bliver')
ok(view.includes('data-testid="mail-other-kobl-button"'), 'forslag-knappen bliver')
const matchAt = view.indexOf('data-testid="mail-suggest-match"')
const otherAt = view.indexOf('data-testid="mail-suggest-other"')
const between = matchAt >= 0 && otherAt > matchAt ? view.slice(matchAt, otherAt) : ''
ok(between.includes(id), 'kolonnen er i match-kortet')
ok(!between.includes('mail-other-column'), 'forslag-kolonnen er et andet sted')
ok(view.includes('Kobl'), 'teksten bliver')
ok(view.includes('data-testid="mail-body-loading"'), 'indlaesningen bliver')
ok(view.includes('data-testid="mail-create-offer"'), 'opret-tilbud bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-match-column-wrap-test')
