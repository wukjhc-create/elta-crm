/**
 * Kundenavnet paa e-mail-match i mail-detaljen kan krympe. Navnet bliver.
 *   npx tsx scripts/mail-match-name-wrap-test.ts
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
const id = 'data-testid="mail-match-name"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 70, at + 10) : ''
const bare = '<p className="text-sm font-medium text-gray-900 break-words">{detectedCustomer.company_name}</p>'
const cell = '<p className="text-sm font-medium text-gray-900 break-words min-w-0" data-testid="mail-match-name">{detectedCustomer.company_name}</p>'
ok(row.includes('<p '), 'det er kundenavnet')
ok(row.includes('break-words min-w-0'), 'navnet kan krympe')
ok(!row.includes('company_name'), 'navnet er et andet sted')
ok(!row.includes('s.company_name'), 'forslaget er et andet sted')
ok(!row.includes('mail-suggest-match'), 'kortet er et andet sted')
ok(!row.includes('mail-match-number'), 'nummeret er et andet sted')
ok(!row.includes('email-match'), 'matchteksten er et andet sted')
ok(!row.includes('flex-1'), 'kolonnen er et andet sted')
ok(view.split(id).length === 2, 'navnet findes en gang')
ok(view.split(cell).length === 2, 'navneklassen findes en gang')
ok(view.split(bare).length === 1, 'det bare afsnit er vaek')
ok(view.includes('{detectedCustomer.company_name}'), 'navnet bliver')
ok(view.includes('break-words min-w-0" data-testid="mail-other-name">{s.company_name}'), 'forslaget bliver')
ok(view.includes('data-testid="mail-suggest-match"'), 'kortet bliver')
ok(view.includes('data-testid="mail-match-number"'), 'nummeret bliver')
ok(view.includes('Kobl'), 'kobl bliver')
ok(view.includes('data-testid="mail-reply-msg"'), 'svaret bliver')
ok(view.includes('data-testid="mail-body-loading"'), 'indlaesningen bliver')
ok(view.includes('data-testid="mail-create-offer"'), 'opret-tilbud bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-match-name-wrap-test')
