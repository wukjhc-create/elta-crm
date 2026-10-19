/**
 * Kundenavnet i mail-detaljen kan krympe. Navnet bliver.
 *   npx tsx scripts/mail-linked-customer-strong-wrap-test.ts
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
const id = 'data-testid="mail-linked-customer-strong"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 40, at + 10) : ''
const cell = 'className="break-words min-w-0" data-testid="mail-linked-customer-strong"'
ok(row.includes('<strong'), 'det er navnet')
ok(row.includes('break-words min-w-0'), 'navnet kan krympe')
ok(!row.includes('Koblet'), 'koblingsteksten er et andet sted')
ok(!row.includes('company_name'), 'navneudtrykket er et andet sted')
ok(!row.includes('mail-linked-customer-name'), 'koblingsspanet er et andet sted')
ok(!row.includes('customer_number'), 'kundenummeret er et andet sted')
ok(!row.includes('mail-link2-icon'), 'ikonet er et andet sted')
ok(view.split(id).length === 2, 'navnet findes en gang')
ok(view.split(cell).length === 2, 'navneklassen findes en gang')
ok(view.split('<strong>{email.customers.company_name}</strong>').length === 1, 'det bare strong er vaek')
ok(view.split('data-testid="mail-linked-customer-name"').length === 2, 'koblingsspan-id kolliderer ikke')
ok(view.split('data-testid="mail-linked-customer-row"').length === 2, 'kunderakke-id kolliderer ikke')
ok(view.includes('{email.customers.company_name}'), 'navnet bliver')
ok(view.includes('Koblet til:'), 'koblingsteksten bliver')
ok(view.includes('({email.customers.customer_number})'), 'kundenummeret bliver')
ok(view.includes('data-testid="mail-linked-customer-name"'), 'koblingsspanet bliver')
ok(view.includes('>Ulæst</span>'), 'ulaest bliver')
ok(view.includes('data-testid="mail-received-at">{formatDate(email.received_at)}'), 'tidspunktet bliver')
ok(view.includes('href={lightboxUrl}'), 'lysbokslinket bliver')
ok(view.includes('text-[11px] text-white line-clamp-2 break-all">{att.filename}'), 'filnavnet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-linked-customer-strong-wrap-test')
