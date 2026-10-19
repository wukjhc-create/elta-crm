/**
 * Knappen Fjern kobling i mail-detaljen kan krympe. Teksten Fjern kobling bliver.
 *   npx tsx scripts/mail-unlink-button-wrap-test.ts
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
const id = 'data-testid="mail-unlink-button"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 600, at + 10) : ''
const cell = 'className="text-red-500 hover:text-red-700 hover:bg-red-50 inline-flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed break-words min-w-0" data-testid="mail-unlink-button"'
ok(row.includes('<button'), 'det er knappen')
ok(row.includes('break-words min-w-0'), 'knappen kan krympe')
ok(row.includes('onUnlinkCustomer'), 'handleren sidder paa knappen')
ok(!row.includes('Fjern'), 'knapteksten er et andet sted')
ok(!row.includes('mail-open-customer-link'), 'kundelinket er et andet sted')
ok(!row.includes('mail-linked-customer-row'), 'kunderakken er et andet sted')
ok(!row.includes('Åbn kunde'), 'kundeteksten er et andet sted')
ok(view.split(id).length === 2, 'knappen findes en gang')
ok(view.split(cell).length === 2, 'knapklassen findes en gang')
ok(view.split('className="text-red-500 hover:text-red-700 hover:bg-red-50 inline-flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"').length === 1, 'den bare knap er vaek')
ok(view.split('data-testid="mail-open-customer-link"').length === 2, 'kundelink-id kolliderer ikke')
ok(view.split('data-testid="mail-linked-customer-row"').length === 2, 'kunderakke-id kolliderer ikke')
ok(view.includes('title="Fjern kobling"'), 'titlen bliver')
ok(view.includes('Fjern kobling'), 'knapteksten bliver')
ok(view.includes('disabled={isUnlinking}'), 'disabled bliver')
ok(view.includes('await onUnlinkCustomer()'), 'kaldet bliver')
ok(view.includes('data-testid="mail-open-customer-link"'), 'kundelinket bliver')
ok(view.includes('Åbn kunde <ExternalLink className="w-3 h-3" />'), 'kundeteksten bliver')
ok(view.includes('Koblet til:'), 'koblingsteksten bliver')
ok(view.includes('>Ulæst</span>'), 'ulaest bliver')
ok(view.includes('data-testid="mail-received-at">{formatDate(email.received_at)}'), 'tidspunktet bliver')
ok(view.includes('href={lightboxUrl}'), 'lysbokslinket bliver')
ok(view.includes('text-[11px] text-white line-clamp-2 break-all">{att.filename}'), 'filnavnet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-unlink-button-wrap-test')
