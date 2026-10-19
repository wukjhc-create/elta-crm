/**
 * Raekken Koblet til kunde i mail-detaljen kan krympe. Teksten Koblet til bliver.
 *   npx tsx scripts/mail-linked-customer-row-wrap-test.ts
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
const id = 'data-testid="mail-linked-customer-row"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 130, at + 10) : ''
const cell = 'className="flex items-center gap-2 text-sm bg-green-50 border border-green-200 p-2.5 rounded-md break-words min-w-0" data-testid="mail-linked-customer-row"'
ok(row.includes('<div'), 'det er raekken')
ok(row.includes('break-words min-w-0'), 'raekken kan krympe')
ok(!row.includes('Koblet til'), 'teksten er et andet sted')
ok(!row.includes('Åbn kunde'), 'kundelinket er et andet sted')
ok(!row.includes('mail-agent-inbox-link'), 'indbakkelinket er et andet sted')
ok(!row.includes('Link2'), 'ikonet er et andet sted')
ok(view.split(id).length === 2, 'raekken findes en gang')
ok(view.split(cell).length === 2, 'raekkeklassen findes en gang')
ok(view.split('className="flex items-center gap-2 text-sm bg-green-50 border border-green-200 p-2.5 rounded-md"').length === 1, 'den bare raekke er vaek')
ok(view.split('data-testid="mail-agent-inbox-link"').length === 2, 'indbakke-id kolliderer ikke')
ok(view.split('data-testid="mail-agent-result"').length === 2, 'resultat-id kolliderer ikke')
ok(view.includes('Koblet til:'), 'teksten bliver')
ok(view.includes('{email.customers.company_name}'), 'kundenavnet bliver')
ok(view.includes('href={`/dashboard/customers/${email.customers.id}`}'), 'kundehref bliver')
ok(view.includes('Åbn kunde'), 'kundelinkteksten bliver')
ok(view.includes('href="/dashboard/agents"'), 'indbakkehref bliver')
ok(view.includes('Åbn Agent Inbox →'), 'indbakketeksten bliver')
ok(view.includes('>Ulæst</span>'), 'ulaest bliver')
ok(view.includes('data-testid="mail-received-at">{formatDate(email.received_at)}'), 'tidspunktet bliver')
ok(view.includes('href={lightboxUrl}'), 'lysbokslinket bliver')
ok(view.includes('text-[11px] text-white line-clamp-2 break-all">{att.filename}'), 'filnavnet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-linked-customer-row-wrap-test')
