/**
 * Emnerakken i mail-detaljen kan krympe. Emnet og Ulaest bliver.
 *   npx tsx scripts/mail-subject-row-wrap-test.ts
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
const id = 'data-testid="mail-subject-row"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 10) : ''
const cell = 'className="flex items-start justify-between gap-3 break-words min-w-0" data-testid="mail-subject-row"'
ok(row.includes('<div'), 'det er emnerakken')
ok(row.includes('flex items-start justify-between gap-3 break-words min-w-0'), 'emnerakken kan krympe')
ok(!row.includes('mail-subject"'), 'emnet er et andet sted')
ok(!row.includes('<h2'), 'overskriften er et andet sted')
ok(!row.includes('Ulæst'), 'ulaest er et andet sted')
ok(!row.includes('mail-unread'), 'ulaest-id er et andet sted')
ok(!row.includes('shrink-0'), 'badge-raekken er et andet sted')
ok(!row.includes('space-y-4'), 'sidehovedet er et andet sted')
ok(!row.includes('mail-forwarded'), 'videresendt er et andet sted')
ok(!row.includes('mail-sender'), 'afsenderen er et andet sted')
ok(!row.includes('aria-label'), 'etiketten er et andet sted')
ok(!row.includes('lightbox'), 'lysboksen er et andet sted')
ok(view.split(id).length === 2, 'emnerakken findes en gang')
ok(view.split(cell).length === 2, 'emnerakkens klasse findes en gang')
ok(view.split('className="flex items-start justify-between gap-3"').length === 1, 'den bare raekke er vaek')
ok(view.split('data-testid="mail-subject"').length === 2, 'emne-id kolliderer ikke')
ok(view.split('data-testid="mail-unread-badge"').length === 2, 'ulaest-id kolliderer ikke')
ok(view.includes('data-testid="mail-subject">{email.subject || \'(Intet emne)\'}'), 'emnet bliver')
ok(view.includes('>Ulæst</span>'), 'ulaest bliver')
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
console.log('PASS  mail-subject-row-wrap-test')
