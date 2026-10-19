/**
 * Modtagelsestidspunktet i mail-detaljen kan krympe. formatDate bliver.
 *   npx tsx scripts/mail-received-at-wrap-test.ts
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
const id = 'data-testid="mail-received-at"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 60, at + 10) : ''
const cell = 'className="text-xs text-gray-400 break-words min-w-0" data-testid="mail-received-at"'
ok(row.includes('<span'), 'det er tidspunktet')
ok(row.includes('text-xs text-gray-400 break-words min-w-0'), 'tidspunktet kan krympe')
ok(!row.includes('formatDate'), 'kaldet er et andet sted')
ok(!row.includes('email.received_at'), 'tidspunktet er et andet sted')
ok(!row.includes('mail-sender'), 'afsenderen er et andet sted')
ok(!row.includes('mail-sender-address'), 'adressen er et andet sted')
ok(!row.includes('mail-subject'), 'emnet er et andet sted')
ok(!row.includes('aria-label'), 'etiketten er et andet sted')
ok(!row.includes('line-clamp-2'), 'filnavnet er et andet sted')
ok(!row.includes('lightbox'), 'lysboksen er et andet sted')
ok(!row.includes('justify-between'), 'raekken er et andet sted')
ok(view.split(id).length === 2, 'tidspunktet findes en gang')
ok(view.split(cell).length === 2, 'tidspunktets klasse findes en gang')
ok(view.split('className="text-xs text-gray-400"').length === 1, 'det bare tidspunkt er vaek')
ok(view.includes('data-testid="mail-received-at">{formatDate(email.received_at)}'), 'kaldet bliver')
ok(view.includes('data-testid="mail-sender">{email.sender_name || email.sender_email}'), 'afsenderen bliver')
ok(view.includes('data-testid="mail-sender-address">&lt;{email.sender_email}&gt;'), 'adressen bliver')
ok(view.includes('data-testid="mail-subject">{email.subject || \'(Intet emne)\'}'), 'emnet bliver')
ok(view.includes('aria-label="Luk"'), 'luk bliver')
ok(view.includes('text-[11px] text-white line-clamp-2 break-all">{att.filename}'), 'filnavnet bliver')
ok(view.includes('href={lightboxUrl}'), 'linket bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-received-at-wrap-test')
