/**
 * Knappen Marker som laest i mail-detaljen kan krympe. Teksterne bliver.
 *   npx tsx scripts/mail-mark-read-button-wrap-test.ts
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
const id = 'data-testid="mail-mark-read-button"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 400, at + 10) : ''
const bare = 'inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md border-2 transition-colors ${'
const cell = 'inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md border-2 transition-colors break-words min-w-0 ${'
ok(row.includes('<button'), 'det er knappen')
ok(row.includes('break-words min-w-0'), 'knappen kan krympe')
ok(row.includes('border-2 transition-colors'), 'rammen bliver')
ok(row.includes('onClick={onToggleRead}'), 'klikket bliver')
ok(row.includes('border-blue-400'), 'laest-farven bliver')
ok(row.includes('border-gray-300'), 'ulaest-farven bliver')
ok(!row.includes('Markér som ulæst'), 'ulaest-teksten er et andet sted')
ok(!row.includes('Markér som læst'), 'laest-teksten er et andet sted')
ok(!row.includes('mail-mark-unread-icon'), 'ulaest-ikonet er et andet sted')
ok(!row.includes('mail-mark-read-icon'), 'laest-ikonet er et andet sted')
ok(!row.includes('<Mail '), 'ulaest-tagget er et andet sted')
ok(!row.includes('<MailOpen'), 'laest-tagget er et andet sted')
ok(!row.includes('Opret tilbud'), 'tilbudsknappen er et andet sted')
ok(!row.includes('mail-archive-button'), 'arkivknappen er et andet sted')
ok(view.split(id).length === 2, 'knappen findes en gang')
ok(view.split(cell).length === 2, 'knapklassen findes en gang')
ok(view.split(bare).length === 1, 'den bare klasse er vaek')
ok(view.split('data-testid="mail-mark-read-icon"').length === 2, 'laest-ikon kolliderer ikke')
ok(view.split('data-testid="mail-mark-unread-icon"').length === 2, 'ulaest-ikon kolliderer ikke')
ok(view.includes('Markér som ulæst'), 'ulaest-teksten bliver')
ok(view.includes('Markér som læst'), 'laest-teksten bliver')
ok(view.includes('onClick={onToggleRead}'), 'handleren bliver')
ok(view.includes('border-blue-400 bg-blue-50 text-blue-700 hover:bg-blue-100'), 'laest-farverne bliver')
ok(view.includes('border-gray-300 bg-white text-gray-700 hover:bg-gray-50'), 'ulaest-farverne bliver')
ok(view.includes('data-testid="mail-mark-read-icon"'), 'laest-ikonet bliver')
ok(view.includes('data-testid="mail-mark-unread-icon"'), 'ulaest-ikonet bliver')
ok(view.includes('data-testid="mail-archive-button"'), 'arkivknappen bliver')
ok(view.includes('Arkivér'), 'arkivteksten bliver')
ok(view.includes('<p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Hurtigt svar</p>'), 'hurtigt svar bliver')
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
console.log('PASS  mail-mark-read-button-wrap-test')
