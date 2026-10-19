/**
 * Handlingsraekken ved den koblede kunde kan krympe. Aabn kunde bliver.
 * Sagvaelgerens bare raekke laengere nede bliver.
 *   npx tsx scripts/mail-linked-customer-actions-wrap-test.ts
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
const id = 'data-testid="mail-linked-customer-actions"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 100, at + 10) : ''
const cell = 'className="ml-auto flex items-center gap-2 shrink-0 break-words min-w-0" data-testid="mail-linked-customer-actions"'
ok(row.includes('<div'), 'det er raekken')
ok(row.includes('break-words min-w-0'), 'raekken kan krympe')
ok(row.includes('ml-auto'), 'ml-auto bliver')
ok(!row.includes('customer_number'), 'kundenummeret er et andet sted')
ok(!row.includes('mail-linked-customer-number'), 'nummeret er et andet sted')
ok(!row.includes('Åbn'), 'kundeteksten er et andet sted')
ok(!row.includes('mail-open-customer-link'), 'kundelinket er et andet sted')
ok(!row.includes('href='), 'href er et andet sted')
ok(view.split(id).length === 2, 'raekken findes en gang')
ok(view.split(cell).length === 2, 'raekkeklassen findes en gang')
ok(view.split('className="ml-auto flex items-center gap-2 shrink-0"').length === 2, 'sagsvaelgerens bare raekke bliver')
ok(view.split('data-testid="mail-linked-customer-number"').length === 2, 'nummer-id kolliderer ikke')
ok(view.split('data-testid="mail-open-customer-link"').length === 2, 'kundelink-id kolliderer ikke')
ok(view.includes('Åbn kunde <ExternalLink className="w-3 h-3" />'), 'kundeteksten bliver')
ok(view.includes('href={`/dashboard/customers/${email.customers.id}`}'), 'kundehref bliver')
ok(view.includes('({email.customers.customer_number})'), 'nummeret bliver')
ok(view.includes('title="Vælg sag"'), 'sagsvaelgeren bliver')
ok(view.includes('>Ulæst</span>'), 'ulaest bliver')
ok(view.includes('data-testid="mail-received-at">{formatDate(email.received_at)}'), 'tidspunktet bliver')
ok(view.includes('href={lightboxUrl}'), 'lysbokslinket bliver')
ok(view.includes('text-[11px] text-white line-clamp-2 break-all">{att.filename}'), 'filnavnet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-linked-customer-actions-wrap-test')
