/**
 * Ikonet paa Marker som laest i mail-detaljen kan krympe. Teksten bliver.
 *   npx tsx scripts/mail-mark-read-icon-wrap-test.ts
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
const id = 'data-testid="mail-mark-read-icon"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 10) : ''
const cell = '<MailOpen className="w-4 h-4 break-words min-w-0" data-testid="mail-mark-read-icon" />'
const bare = '<MailOpen className="w-4 h-4" />'
ok(row.includes('<MailOpen'), 'det er ikonet')
ok(row.includes('w-4 h-4'), 'stoerrelsen bliver')
ok(row.includes('break-words min-w-0'), 'ikonet kan krympe')
ok(!row.includes('Markér som læst'), 'teksten er et andet sted')
ok(!row.includes('Markér som ulæst'), 'ulaest-teksten er et andet sted')
ok(!row.includes('<Mail '), 'det andet mailikon er et andet sted')
ok(!row.includes('<button'), 'knap-tagget er et andet sted')
ok(!row.includes('onToggleRead'), 'klikket er et andet sted')
ok(!row.includes('Archive'), 'arkivikonet er et andet sted')
ok(view.split(id).length === 2, 'ikonet findes en gang')
ok(view.split(cell).length === 2, 'ikonklassen findes en gang')
ok(view.split(bare).length === 1, 'det bare ikon er vaek')
ok(view.includes('Markér som læst'), 'teksten bliver')
ok(view.includes('<Mail className="w-4 h-4" />'), 'ulaest-ikonet bliver')
ok(view.includes('Markér som ulæst'), 'ulaest-teksten bliver')
ok(view.includes('onToggleRead'), 'klikket bliver')
ok(view.includes('Arkivér'), 'arkivteksten bliver')
ok(view.includes('<Archive className="w-4 h-4 break-words min-w-0" data-testid="mail-archive-icon" />'), 'arkivikonet bliver')
ok(view.includes('data-testid="mail-opret-sag-icon"'), 'sagsikonet bliver')
ok(view.includes('Opret sag'), 'opret-sag-teksten bliver')
ok(view.includes('data-testid="mail-create-offer-icon"'), 'tilbudsikonet bliver')
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
console.log('PASS  mail-mark-read-icon-wrap-test')
