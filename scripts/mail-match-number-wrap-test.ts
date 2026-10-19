/**
 * Kundenummeret paa e-mail-match i mail-detaljen kan krympe. Nummeret bliver.
 *   npx tsx scripts/mail-match-number-wrap-test.ts
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
const id = 'data-testid="mail-match-number"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 60, at + 10) : ''
const bare = '<p className="text-xs text-gray-500">{detectedCustomer.customer_number} — email-match</p>'
const cell = '<p className="text-xs text-gray-500 break-words min-w-0" data-testid="mail-match-number">{detectedCustomer.customer_number} — email-match</p>'
ok(row.includes('<p '), 'det er nummeret')
ok(row.includes('text-xs text-gray-500'), 'nummeret bliver graat')
ok(row.includes('break-words min-w-0'), 'nummeret kan krympe')
ok(!row.includes('customer_number'), 'nummeret er et andet sted')
ok(!row.includes('email-match'), 'teksten er et andet sted')
ok(!row.includes('company_name'), 'kundenavnet er et andet sted')
ok(!row.includes('mail-suggest-match'), 'kortet er et andet sted')
ok(view.split(id).length === 2, 'nummeret findes en gang')
ok(view.split(cell).length === 2, 'nummerklassen findes en gang')
ok(view.split(bare).length === 1, 'det bare afsnit er vaek')
ok(view.includes('{detectedCustomer.customer_number} — email-match'), 'nummeret bliver')
ok(view.includes('<p className="text-xs text-gray-500">{s.customer_number} — {s.matchReason}</p>'), 'det andet nummer bliver')
ok(view.includes('break-words">{detectedCustomer.company_name}'), 'fundet kunde ombrydes stadig')
ok(view.includes('data-testid="mail-suggest-match"'), 'e-mail-kortet bliver')
ok(view.includes('data-testid="mail-suggest-other"'), 'det graa kort bliver')
ok(view.includes('Kobl'), 'kobl bliver')
ok(view.includes('data-testid="mail-reply-msg"'), 'svaret bliver')
ok(view.includes('data-testid="mail-body-loading"'), 'indlaesningen bliver')
ok(view.includes('data-testid="mail-create-offer"'), 'opret-tilbud bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-match-number-wrap-test')
