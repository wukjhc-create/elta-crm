/**
 * Ikonet paa Marker som ulaest i mail-detaljen kan krympe. Teksten bliver.
 *   npx tsx scripts/mail-mark-unread-icon-wrap-test.ts
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
const id = 'data-testid="mail-mark-unread-icon"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 10) : ''
const cell = '<Mail className="w-4 h-4 break-words min-w-0" data-testid="mail-mark-unread-icon" />'
const bare = '<Mail className="w-4 h-4" />'
ok(row.includes('<Mail '), 'det er ikonet')
ok(row.includes('w-4 h-4'), 'stoerrelsen bliver')
ok(row.includes('break-words min-w-0'), 'ikonet kan krympe')
ok(!row.includes('Markér som ulæst'), 'teksten er et andet sted')
ok(!row.includes('Markér som læst'), 'laest-teksten er et andet sted')
ok(!row.includes('<MailOpen'), 'laest-ikonet er et andet sted')
ok(!row.includes('mail-mark-read-icon'), 'laest-id er et andet sted')
ok(!row.includes('<button'), 'knap-tagget er et andet sted')
ok(!row.includes('onToggleRead'), 'klikket er et andet sted')
ok(!row.includes('border-blue-400'), 'knapfarven er et andet sted')
ok(view.split(id).length === 2, 'ikonet findes en gang')
ok(view.split(cell).length === 2, 'ikonklassen findes en gang')
ok(view.split(bare).length === 1, 'det bare ikon er vaek')
ok(view.split('data-testid="mail-mark-read-icon"').length === 2, 'laest-id kolliderer ikke')
ok(view.includes('Markér som ulæst'), 'teksten bliver')
ok(view.includes('Markér som læst'), 'laest-teksten bliver')
ok(view.includes('data-testid="mail-mark-read-icon"'), 'laest-ikonet bliver')
ok(view.includes('onToggleRead'), 'klikket bliver')
ok(view.includes('data-testid="mail-archive-icon"'), 'arkivikonet bliver')
ok(view.includes('data-testid="mail-restore-icon"'), 'relevant-ikonet bliver')
ok(view.includes('data-testid="mail-action-row"'), 'handlingsraekken bliver')
ok(view.includes('Kobl til eksisterende'), 'kobl-teksten bliver')
ok(view.includes('data-testid="mail-task-title"'), 'opgavetitlen bliver')
ok(view.includes('data-testid="mail-body-loading"'), 'indlaesningen bliver')
ok(view.includes('>Ulæst</span>'), 'ulaest bliver')
ok(view.includes('data-testid="mail-received-at">{formatDate(email.received_at)}'), 'tidspunktet bliver')
ok(view.includes('href={lightboxUrl}'), 'lysbokslinket bliver')
ok(view.includes('text-[11px] text-white line-clamp-2 break-all">{att.filename}'), 'filnavnet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-mark-unread-icon-wrap-test')
