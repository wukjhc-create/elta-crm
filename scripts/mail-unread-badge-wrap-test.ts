/**
 * Ulaest-maerket i mail-detaljen kan krympe. Teksten bliver.
 *   npx tsx scripts/mail-unread-badge-wrap-test.ts
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
const id = 'data-testid="mail-unread-badge"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 120, at + 10) : ''
const cell = 'className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 break-words min-w-0" data-testid="mail-unread-badge"'
ok(row.includes('<span'), 'det er ulaest-maerket')
ok(row.includes('px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 break-words min-w-0'), 'ulaest-maerket kan krympe')
ok(!row.includes('Ulæst'), 'teksten er et andet sted')
ok(!row.includes('is_read'), 'vagten er et andet sted')
ok(!row.includes('shrink-0'), 'badge-raekken er et andet sted')
ok(!row.includes('mail-subject'), 'emnet er et andet sted')
ok(!row.includes('gap-3'), 'emnerakken er et andet sted')
ok(!row.includes('mail-forwarded'), 'videresendt er et andet sted')
ok(!row.includes('mail-sender'), 'afsenderen er et andet sted')
ok(!row.includes('aria-label'), 'etiketten er et andet sted')
ok(!row.includes('lightbox'), 'lysboksen er et andet sted')
ok(view.split(id).length === 2, 'ulaest-maerket findes en gang')
ok(view.split(cell).length === 2, 'ulaest-maerkets klasse findes en gang')
ok(view.split('className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700"').length === 1, 'det bare maerke er vaek')
ok(view.split('data-testid="mail-subject"').length === 2, 'emne-id kolliderer ikke')
ok(view.split('data-testid="mail-sender"').length === 2, 'afsender-id kolliderer ikke')
ok(view.split('className="flex items-center gap-2 shrink-0"').length === 1, 'den bare badge-raekke er vaek')
ok(view.includes('>Ulæst</span>'), 'teksten bliver')
ok(view.includes('data-testid="mail-subject">{email.subject || \'(Intet emne)\'}'), 'emnet bliver')
ok(view.includes('data-testid="mail-sender">{email.sender_name || email.sender_email}'), 'afsenderen bliver')
ok(view.includes('data-testid="mail-received-at">{formatDate(email.received_at)}'), 'tidspunktet bliver')
ok(view.includes('Videresendt fra: {email.original_sender_name || email.original_sender_email}'), 'videresendt bliver')
ok(view.includes('aria-label="Luk"'), 'luk bliver')
ok(view.includes('text-[11px] text-white line-clamp-2 break-all">{att.filename}'), 'filnavnet bliver')
ok(view.includes('href={lightboxUrl}'), 'linket bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-unread-badge-wrap-test')
