/**
 * Afsenderadressen i mail-detaljen kan krympe. Adressen bliver.
 *   npx tsx scripts/mail-sender-address-wrap-test.ts
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
const id = 'data-testid="mail-sender-address"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 60, at + 10) : ''
const cell = 'className="ml-1 text-gray-400 break-words min-w-0" data-testid="mail-sender-address"'
ok(row.includes('<span'), 'det er adressen')
ok(row.includes('ml-1 text-gray-400 break-words min-w-0'), 'adressen kan krympe')
ok(!row.includes('email.sender_name'), 'navnet er et andet sted')
ok(!row.includes('email.sender_email'), 'adressen er et andet sted')
ok(!row.includes('mail-sender"'), 'afsenderen er et andet sted')
ok(!row.includes('&lt;'), 'visningen er et andet sted')
ok(!row.includes('mail-subject'), 'emnet er et andet sted')
ok(!row.includes('formatDate'), 'datoen er et andet sted')
ok(!row.includes('aria-label'), 'etiketten er et andet sted')
ok(!row.includes('line-clamp-2'), 'filnavnet er et andet sted')
ok(!row.includes('lightbox'), 'lysboksen er et andet sted')
ok(view.split(id).length === 2, 'adressen findes en gang')
ok(view.split(cell).length === 2, 'adressens klasse findes en gang')
ok(view.split('className="ml-1 text-gray-400"').length === 1, 'den bare adresse er vaek')
ok(view.split('data-testid="mail-sender"').length === 2, 'afsender-id kolliderer ikke')
ok(view.includes('email.sender_name &&'), 'navnevagten bliver')
ok(view.includes('data-testid="mail-sender-address">&lt;{email.sender_email}&gt;'), 'adressen bliver')
ok(view.includes('data-testid="mail-sender">{email.sender_name || email.sender_email}'), 'afsenderen bliver')
ok(view.includes('formatDate(email.received_at)'), 'modtagelsestidspunktet bliver')
ok(view.includes('aria-label="Luk"'), 'luk bliver')
ok(view.includes('text-[11px] text-white line-clamp-2 break-all">{att.filename}'), 'filnavnet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-sender-address-wrap-test')
