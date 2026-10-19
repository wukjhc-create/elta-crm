/**
 * Kortet for e-mail-match i mail-detaljen kan krympe. Navn og Kobl bliver.
 *   npx tsx scripts/mail-suggest-match-wrap-test.ts
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
const id = 'data-testid="mail-suggest-match"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 120, at + 10) : ''
const bare = 'className="flex items-center gap-2 bg-white rounded px-2.5 py-2 border border-blue-100"'
const cell = 'className="flex items-center gap-2 bg-white rounded px-2.5 py-2 border border-blue-100 break-words min-w-0" data-testid="mail-suggest-match"'
ok(row.includes('<div '), 'det er kortet')
ok(row.includes('border-blue-100'), 'kortet bliver blaat')
ok(row.includes('break-words min-w-0'), 'kortet kan krympe')
ok(!row.includes('company_name'), 'kundenavnet er et andet sted')
ok(!row.includes('Kobl'), 'kobl er et andet sted')
ok(!row.includes('detectedCustomer'), 'betingelsen er et andet sted')
ok(!row.includes('border-gray-100'), 'det andet kort er et andet sted')
ok(!row.includes('mail-suggest-box'), 'boksen er et andet sted')
ok(view.split(id).length === 2, 'kortet findes en gang')
ok(view.split(cell).length === 2, 'kortklassen findes en gang')
ok(view.split(bare).length === 1, 'den bare klasse er vaek')
ok(view.split('data-testid="mail-suggest-frame"').length === 2, 'ramme-id kolliderer ikke')
ok(view.split('data-testid="mail-suggest-box"').length === 2, 'boks-id kolliderer ikke')
ok(view.includes('break-words">{detectedCustomer.company_name}'), 'fundet kunde ombrydes stadig')
ok(view.includes('break-words">{s.company_name}'), 'forslag ombrydes stadig')
ok(view.includes('Kobl'), 'kobl bliver')
ok(view.includes('border border-gray-100 break-words min-w-0" data-testid="mail-suggest-other"'), 'det graa kort bliver')
ok(view.includes('Mulige matches (forslag)'), 'overskriften bliver')
ok(view.includes('data-testid="mail-suggest-frame"'), 'rammen bliver')
ok(view.includes('data-testid="mail-reply-msg"'), 'svaret bliver')
ok(view.includes('data-testid="mail-body-loading"'), 'indlaesningen bliver')
ok(view.includes('data-testid="mail-create-offer"'), 'opret-tilbud bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-suggest-match-wrap-test')
