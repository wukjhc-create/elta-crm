/**
 * Mail-detaljens ydre ramme kan krympe. Sidehovedet, emnet og Ulaest bliver.
 *   npx tsx scripts/mail-detail-frame-wrap-test.ts
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
const id = 'data-testid="mail-detail-frame"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 70, at + 10) : ''
const cell = 'className="flex flex-col h-full bg-white break-words min-w-0" data-testid="mail-detail-frame"'
ok(row.includes('<div'), 'det er rammen')
ok(row.includes('flex flex-col h-full bg-white break-words min-w-0'), 'rammen kan krympe')
ok(!row.includes('mail-detail-header'), 'sidehovedet er et andet sted')
ok(!row.includes('mail-subject'), 'emnet er et andet sted')
ok(!row.includes('Ulæst'), 'ulaest er et andet sted')
ok(!row.includes('lightbox'), 'lysboksen er et andet sted')
ok(!row.includes('return'), 'funktionen er et andet sted')
ok(view.split(id).length === 2, 'rammen findes en gang')
ok(view.split(cell).length === 2, 'rammens klasse findes en gang')
ok(view.split('className="flex flex-col h-full bg-white"').length === 1, 'den bare ramme er vaek')
ok(view.split('data-testid="mail-detail-header"').length === 2, 'sidehoved-id kolliderer ikke')
ok(view.split('data-testid="mail-subject"').length === 2, 'emne-id kolliderer ikke')
ok(view.includes('data-testid="mail-detail-header"'), 'sidehovedet bliver')
ok(view.includes('data-testid="mail-subject">{email.subject || \'(Intet emne)\'}'), 'emnet bliver')
ok(view.includes('>Ulæst</span>'), 'ulaest bliver')
ok(view.includes('data-testid="mail-badge-row"'), 'badge-raekken bliver')
ok(view.includes('data-testid="mail-received-at">{formatDate(email.received_at)}'), 'tidspunktet bliver')
ok(view.includes('aria-label="Luk"'), 'luk bliver')
ok(view.includes('href={lightboxUrl}'), 'linket bliver')
ok(view.includes('text-[11px] text-white line-clamp-2 break-all">{att.filename}'), 'filnavnet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-detail-frame-wrap-test')
