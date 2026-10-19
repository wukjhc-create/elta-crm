/**
 * Linket Abn kunde i mail-detaljen kan krympe. Teksten Abn kunde bliver.
 *   npx tsx scripts/mail-open-customer-link-wrap-test.ts
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
const id = 'data-testid="mail-open-customer-link"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 160, at + 10) : ''
const cell = 'className="text-blue-600 hover:underline inline-flex items-center gap-1 text-xs break-words min-w-0" data-testid="mail-open-customer-link"'
ok(row.includes('<a'), 'det er linket')
ok(row.includes('break-words min-w-0'), 'linket kan krympe')
ok(row.includes('email.customers.id'), 'href sidder paa linket')
ok(!row.includes('Åbn kunde'), 'linkteksten er et andet sted')
ok(!row.includes('mail-linked-customer-row'), 'kunderakken er et andet sted')
ok(!row.includes('Koblet til'), 'koblingsteksten er et andet sted')
ok(!row.includes('Fjern kobling'), 'fjern-knappen er et andet sted')
ok(!row.includes('mail-agent-inbox-link'), 'indbakkelinket er et andet sted')
ok(view.split(id).length === 2, 'linket findes en gang')
ok(view.split(cell).length === 2, 'linkklassen findes en gang')
ok(view.split('className="text-blue-600 hover:underline inline-flex items-center gap-1 text-xs"').length === 1, 'det bare link er vaek')
ok(view.split('data-testid="mail-linked-customer-row"').length === 2, 'kunderakke-id kolliderer ikke')
ok(view.split('data-testid="mail-agent-inbox-link"').length === 2, 'indbakke-id kolliderer ikke')
ok(view.includes('href={`/dashboard/customers/${email.customers.id}`}'), 'kundehref bliver')
ok(view.includes('Åbn kunde <ExternalLink className="w-3 h-3" />'), 'linkteksten bliver')
ok(view.includes('Koblet til:'), 'koblingsteksten bliver')
ok(view.includes('{email.customers.company_name}'), 'kundenavnet bliver')
ok(view.includes('data-testid="mail-linked-customer-row"'), 'kunderakken bliver')
ok(view.includes('Fjern kobling'), 'fjern-teksten bliver')
ok(view.includes('>Ulæst</span>'), 'ulaest bliver')
ok(view.includes('data-testid="mail-received-at">{formatDate(email.received_at)}'), 'tidspunktet bliver')
ok(view.includes('href={lightboxUrl}'), 'lysbokslinket bliver')
ok(view.includes('text-[11px] text-white line-clamp-2 break-all">{att.filename}'), 'filnavnet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-open-customer-link-wrap-test')
