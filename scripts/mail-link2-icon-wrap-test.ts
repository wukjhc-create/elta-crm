/**
 * Koblingsikonet i mail-detaljen kan krympe. Teksten Koblet til bliver.
 *   npx tsx scripts/mail-link2-icon-wrap-test.ts
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
const id = 'data-testid="mail-link2-icon"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 10) : ''
const cell = 'className="w-4 h-4 text-green-600 shrink-0 break-words min-w-0" data-testid="mail-link2-icon"'
ok(row.includes('<Link2'), 'det er ikonet')
ok(row.includes('break-words min-w-0'), 'ikonet kan krympe')
ok(row.includes('text-green-600'), 'farven bliver')
ok(row.includes('shrink-0'), 'shrink bliver')
ok(!row.includes('Koblet'), 'koblingsteksten er et andet sted')
ok(!row.includes('mail-linked-customer-row'), 'kunderakken er et andet sted')
ok(!row.includes('Åbn'), 'kundeteksten er et andet sted')
ok(!row.includes('company_name'), 'kundenavnet er et andet sted')
ok(view.split(id).length === 2, 'ikonet findes en gang')
ok(view.split(cell).length === 2, 'ikonklassen findes en gang')
ok(view.split('className="w-4 h-4 text-green-600 shrink-0"').length === 1, 'den bare ikonklasse er vaek')
ok(view.split('data-testid="mail-linked-customer-row"').length === 2, 'kunderakke-id kolliderer ikke')
ok(view.includes('Koblet til:'), 'koblingsteksten bliver')
ok(view.includes('{email.customers.company_name}'), 'kundenavnet bliver')
ok(view.includes('data-testid="mail-linked-customer-row"'), 'kunderakken bliver')
ok(view.includes('>Ulæst</span>'), 'ulaest bliver')
ok(view.includes('data-testid="mail-received-at">{formatDate(email.received_at)}'), 'tidspunktet bliver')
ok(view.includes('href={lightboxUrl}'), 'lysbokslinket bliver')
ok(view.includes('text-[11px] text-white line-clamp-2 break-all">{att.filename}'), 'filnavnet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-link2-icon-wrap-test')
