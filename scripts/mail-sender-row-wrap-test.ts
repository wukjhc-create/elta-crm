/**
 * Afsenderraekken i mail-detaljen kan krympe. Afsender og dato bliver.
 *   npx tsx scripts/mail-sender-row-wrap-test.ts
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
const id = 'data-testid="mail-sender-row"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 10) : ''
const cell = 'className="flex items-center justify-between text-sm break-words min-w-0" data-testid="mail-sender-row"'
ok(row.includes('<div'), 'det er afsenderraekken')
ok(row.includes('flex items-center justify-between text-sm break-words min-w-0'), 'afsenderraekken kan krympe')
ok(!row.includes('mail-sender"'), 'afsenderen er et andet sted')
ok(!row.includes('mail-sender-address'), 'adressen er et andet sted')
ok(!row.includes('mail-received-at'), 'tidspunktet er et andet sted')
ok(!row.includes('formatDate'), 'kaldet er et andet sted')
ok(!row.includes('mail-subject'), 'emnet er et andet sted')
ok(!row.includes('aria-label'), 'etiketten er et andet sted')
ok(!row.includes('line-clamp-2'), 'filnavnet er et andet sted')
ok(!row.includes('lightbox'), 'lysboksen er et andet sted')
ok(!row.includes('text-gray-600'), 'kolonnen er et andet sted')
ok(view.split(id).length === 2, 'afsenderraekken findes en gang')
ok(view.split(cell).length === 2, 'afsenderraekkens klasse findes en gang')
ok(view.split('className="flex items-center justify-between text-sm"').length === 1, 'den bare raekke er vaek')
ok(view.split('data-testid="mail-sender"').length === 2, 'afsender-id kolliderer ikke')
ok(view.includes('data-testid="mail-sender">{email.sender_name || email.sender_email}'), 'afsenderen bliver')
ok(view.includes('data-testid="mail-sender-address">&lt;{email.sender_email}&gt;'), 'adressen bliver')
ok(view.includes('data-testid="mail-received-at">{formatDate(email.received_at)}'), 'tidspunktet bliver')
ok(view.includes('data-testid="mail-subject">{email.subject || \'(Intet emne)\'}'), 'emnet bliver')
ok(view.includes('aria-label="Luk"'), 'luk bliver')
ok(view.includes('text-[11px] text-white line-clamp-2 break-all">{att.filename}'), 'filnavnet bliver')
ok(view.includes('href={lightboxUrl}'), 'linket bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-sender-row-wrap-test')
