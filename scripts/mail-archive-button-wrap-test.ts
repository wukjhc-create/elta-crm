/**
 * Knappen Arkiver i mail-detaljen kan krympe. Teksten bliver.
 *   npx tsx scripts/mail-archive-button-wrap-test.ts
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
const id = 'data-testid="mail-archive-button"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 320, at + 10) : ''
const bare = 'className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"'
const cell = bare.slice(0, -1) + ' break-words min-w-0" data-testid="mail-archive-button"'
const readBare = 'className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md border-2 transition-colors break-words min-w-0 ${'
ok(row.includes('<button'), 'det er knappen')
ok(row.includes('hover:bg-gray-50'), 'hover bliver')
ok(row.includes('break-words min-w-0'), 'knappen kan krympe')
ok(row.includes('disabled={pendingAction !== null}'), 'deaktiveringen bliver')
ok(row.includes("runHeaderAction('archive', onArchive)"), 'klikket bliver')
ok(!row.includes('Arkivér'), 'teksten er et andet sted')
ok(!row.includes('mail-archive-icon'), 'ikonet er et andet sted')
ok(!row.includes('<Archive'), 'ikon-tagget er et andet sted')
ok(!row.includes('animate-spin'), 'spinneren er et andet sted')
ok(!row.includes('onToggleRead'), 'laeseknappen er et andet sted')
ok(!row.includes('Markér som ulæst'), 'ulaest-teksten er et andet sted')
ok(!row.includes('mail-ignore-button'), 'ignorer-knappen er et andet sted')
ok(view.split(id).length === 2, 'knappen findes en gang')
ok(view.split(cell).length === 2, 'knapklassen findes en gang')
ok(view.split(bare).length === 1, 'den bare klasse er vaek')
ok(view.split('data-testid="mail-archive-icon"').length === 2, 'ikon-id kolliderer ikke')
ok(view.includes('Arkivér'), 'teksten bliver')
ok(view.includes("runHeaderAction('archive', onArchive)"), 'handleren bliver')
ok(view.includes("pendingAction === 'archive'"), 'betingelsen bliver')
ok(view.includes('data-testid="mail-archive-icon"'), 'ikonet bliver')
ok(view.includes(readBare), 'laeseknappen bliver')
ok(view.includes('Markér som ulæst'), 'ulaest-teksten bliver')
ok(view.includes('Markér som læst'), 'laest-teksten bliver')
ok(view.includes('data-testid="mail-ignore-button"'), 'ignorer-knappen bliver')
ok(view.includes('Ignorér'), 'ignorer-teksten bliver')
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
console.log('PASS  mail-archive-button-wrap-test')
