/**
 * Sidehovedet i mail-detaljen kan krympe. Emnet, emnerakken og Ulaest bliver.
 *   npx tsx scripts/mail-detail-header-wrap-test.ts
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
const id = 'data-testid="mail-detail-header"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 60, at + 10) : ''
const cell = 'className="border-b p-5 space-y-4 break-words min-w-0" data-testid="mail-detail-header"'
ok(row.includes('<div'), 'det er sidehovedet')
ok(row.includes('border-b p-5 space-y-4 break-words min-w-0'), 'sidehovedet kan krympe')
ok(!row.includes('mail-subject-row'), 'emnerakken er et andet sted')
ok(!row.includes('mail-subject"'), 'emnet er et andet sted')
ok(!row.includes('<h2'), 'overskriften er et andet sted')
ok(!row.includes('Ulæst'), 'ulaest er et andet sted')
ok(!row.includes('mail-unread'), 'ulaest-id er et andet sted')
ok(!row.includes('mail-sender'), 'afsenderen er et andet sted')
ok(!row.includes('aria-label'), 'etiketten er et andet sted')
ok(!row.includes('lightbox'), 'lysboksen er et andet sted')
ok(view.split(id).length === 2, 'sidehovedet findes en gang')
ok(view.split(cell).length === 2, 'sidehovedets klasse findes en gang')
ok(view.split('className="border-b p-5 space-y-4"').length === 1, 'det bare sidehoved er vaek')
ok(view.split('data-testid="mail-subject-row"').length === 2, 'emnerakke-id kolliderer ikke')
ok(view.split('data-testid="mail-subject"').length === 2, 'emne-id kolliderer ikke')
ok(view.includes('data-testid="mail-subject-row"'), 'emnerakken bliver')
ok(view.includes('data-testid="mail-subject">{email.subject || \'(Intet emne)\'}'), 'emnet bliver')
ok(view.includes('>Ulæst</span>'), 'ulaest bliver')
ok(view.includes('data-testid="mail-sender">{email.sender_name || email.sender_email}'), 'afsenderen bliver')
ok(view.includes('data-testid="mail-received-at">{formatDate(email.received_at)}'), 'tidspunktet bliver')
ok(view.includes('aria-label="Luk"'), 'luk bliver')
ok(view.includes('text-[11px] text-white line-clamp-2 break-all">{att.filename}'), 'filnavnet bliver')
ok(view.includes('href={lightboxUrl}'), 'linket bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-detail-header-wrap-test')
