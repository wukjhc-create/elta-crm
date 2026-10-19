/**
 * Portalikonet i mail-detaljen kan krympe. Teksten bliver.
 *   npx tsx scripts/mail-portal-icon-wrap-test.ts
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
const id = 'data-testid="mail-portal-icon"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 10) : ''
const cell = 'className="w-4 h-4 text-purple-600 break-words min-w-0" data-testid="mail-portal-icon"'
const bare = 'className="w-4 h-4 text-purple-600"'
ok(row.includes('<MessageCircle'), 'det er ikonet')
ok(row.includes('className'), 'klassen er paa ikonet')
ok(row.includes('break-words min-w-0'), 'ikonet kan krympe')
ok(row.includes('text-purple-600'), 'farven bliver')
ok(!row.includes('mail-portal-frame'), 'rammen er et andet sted')
ok(!row.includes('mail-portal-text'), 'spanet er et andet sted')
ok(!row.includes('Kunden har en aktiv portal'), 'teksten er et andet sted')
ok(!row.includes('Hop til Chat'), 'linkteksten er et andet sted')
ok(!row.includes('#chat'), 'href er et andet sted')
ok(!row.includes('hasPortal'), 'betingelsen er et andet sted')
ok(!row.includes('bg-purple-50'), 'baggrunden er et andet sted')
ok(!row.includes('text-purple-700'), 'tekstfarven er et andet sted')
ok(view.split(id).length === 2, 'ikonet findes en gang')
ok(view.split(cell).length === 2, 'ikonklassen findes en gang')
ok(view.split(bare).length === 1, 'den bare ikonklasse er vaek')
ok(view.split('data-testid="mail-portal-frame"').length === 2, 'ramme-id kolliderer ikke')
ok(view.split('data-testid="mail-portal-text"').length === 2, 'tekst-id kolliderer ikke')
ok(view.includes('Kunden har en aktiv portal'), 'teksten bliver')
ok(view.includes('Hop til Chat'), 'linkteksten bliver')
ok(view.includes('<MessageCircle'), 'ikonet bliver')
ok(view.includes('href={`/dashboard/customers/${email.customers.id}#chat`}'), 'href bliver')
ok(view.includes('data-testid="mail-portal-frame"'), 'rammen bliver')
ok(view.includes('data-testid="mail-portal-text"'), 'spanet bliver')
ok(view.includes('data-testid="mail-body-loading"'), 'indlaesningen bliver')
ok(view.includes('>Ulæst</span>'), 'ulaest bliver')
ok(view.includes('data-testid="mail-received-at">{formatDate(email.received_at)}'), 'tidspunktet bliver')
ok(view.includes('href={lightboxUrl}'), 'lysbokslinket bliver')
ok(view.includes('text-[11px] text-white line-clamp-2 break-all">{att.filename}'), 'filnavnet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-portal-icon-wrap-test')
