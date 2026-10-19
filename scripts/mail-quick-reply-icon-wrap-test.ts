/**
 * Ikonet paa hurtigsvar i mail-detaljen kan krympe. Teksterne bliver.
 *   npx tsx scripts/mail-quick-reply-icon-wrap-test.ts
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
const id = 'data-testid="mail-quick-reply-icon"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 60, at + 10) : ''
const bare = '<Mail className="w-3 h-3" />'
const cell = '<Mail className="w-3 h-3 break-words min-w-0" data-testid="mail-quick-reply-icon" />'
ok(row.includes('<Mail '), 'det er ikonet')
ok(row.includes('w-3 h-3'), 'stoerrelsen bliver')
ok(row.includes('break-words min-w-0'), 'ikonet kan krympe')
ok(!row.includes('animate-spin'), 'spinneren er et andet sted')
ok(!row.includes('Loader2'), 'spinner-tagget er et andet sted')
ok(!row.includes('Bekræft modtagelse'), 'teksten er et andet sted')
ok(!row.includes('mail-quick-reply-button'), 'knappen er et andet sted')
ok(!row.includes('mail-mark-unread-icon'), 'ulaest-ikonet er et andet sted')
ok(!row.includes('<MailOpen'), 'laest-ikonet er et andet sted')
ok(view.split(id).length === 2, 'ikonet findes en gang')
ok(view.split(cell).length === 2, 'ikonklassen findes en gang')
ok(view.split(bare).length === 1, 'det bare ikon er vaek')
ok(view.split('data-testid="mail-quick-reply-button"').length === 2, 'knap-id kolliderer ikke')
ok(view.split('data-testid="mail-quick-reply-label"').length === 2, 'overskrift-id kolliderer ikke')
ok(view.split('data-testid="mail-mark-unread-icon"').length === 2, 'ulaest-id kolliderer ikke')
ok(view.includes('Bekræft modtagelse'), 'bekraeft bliver')
ok(view.includes('Mangler info'), 'mangler-info bliver')
ok(view.includes('Tak for ordren'), 'tak-for-ordren bliver')
ok(!view.includes('<Loader2 className="w-3 h-3 animate-spin" />'), 'den bare spinner er vaek')
ok(view.includes('<Loader2 className="w-3 h-3 animate-spin break-words min-w-0" data-testid="mail-body-loading-spinner" />'), 'indlaesnings-spinneren kan krympe')
ok(view.includes('data-testid="mail-quick-reply-button"'), 'knappen bliver')
ok(view.includes('data-testid="mail-quick-reply-label"'), 'overskriften bliver')
ok(view.includes('>Hurtigt svar</p>'), 'overskriftsteksten bliver')
ok(view.includes('className="pt-2 border-t space-y-2 break-words min-w-0" data-testid="mail-quick-reply-frame"'), 'rammen bliver')
ok(view.includes('data-testid="mail-mark-unread-icon"'), 'ulaest-ikonet bliver')
ok(view.includes('data-testid="mail-action-row"'), 'handlingsraekken bliver')
ok(view.includes('Kobl til eksisterende'), 'kobl-teksten bliver')
ok(view.includes('data-testid="mail-body-loading"'), 'indlaesningen bliver')
ok(view.includes('>Ulæst</span>'), 'ulaest bliver')
ok(view.includes('data-testid="mail-received-at">{formatDate(email.received_at)}'), 'tidspunktet bliver')
ok(view.includes('href={lightboxUrl}'), 'lysbokslinket bliver')
ok(view.includes('text-[11px] text-white line-clamp-2 break-all">{att.filename}'), 'filnavnet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-quick-reply-icon-wrap-test')
