/**
 * Ikonet paa Arkiver i mail-detaljen kan krympe. Teksten bliver.
 *   npx tsx scripts/mail-archive-icon-wrap-test.ts
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
const id = 'data-testid="mail-archive-icon"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 10) : ''
const cell = '<Archive className="w-4 h-4 break-words min-w-0" data-testid="mail-archive-icon" />'
const bare = '<Archive className="w-4 h-4" />'
ok(row.includes('<Archive'), 'det er ikonet')
ok(row.includes('w-4 h-4'), 'stoerrelsen bliver')
ok(row.includes('break-words min-w-0'), 'ikonet kan krympe')
ok(!row.includes('Arkivér'), 'teksten er et andet sted')
ok(!row.includes('pendingAction'), 'betingelsen er et andet sted')
ok(!row.includes('Loader2'), 'spinneren er et andet sted')
ok(!row.includes('animate-spin'), 'spinnerklassen er et andet sted')
ok(!row.includes('<button'), 'knap-tagget er et andet sted')
ok(!row.includes('runHeaderAction'), 'klikket er et andet sted')
ok(!row.includes('Markér som læst'), 'laest-teksten er et andet sted')
ok(view.split(id).length === 2, 'ikonet findes en gang')
ok(view.split(cell).length === 2, 'ikonklassen findes en gang')
ok(view.split(bare).length === 1, 'det bare ikon er vaek')
ok(view.includes('Arkivér'), 'teksten bliver')
ok(view.includes("pendingAction === 'archive'"), 'betingelsen bliver')
ok(view.includes('runHeaderAction(\'archive\', onArchive)'), 'klikket bliver')
ok(view.includes('data-testid="mail-mark-read-icon"'), 'laest-ikonet bliver')
ok(view.includes('Markér som læst'), 'laest-teksten bliver')
ok(view.includes('<EyeOff className="w-4 h-4 break-words min-w-0" data-testid="mail-ignore-icon" />'), 'ignorer-ikonet bliver')
ok(view.includes('Ignorér'), 'ignorer-teksten bliver')
ok(view.includes('data-testid="mail-opret-sag-icon"'), 'sagsikonet bliver')
ok(view.includes('Opret sag'), 'opret-sag-teksten bliver')
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
console.log('PASS  mail-archive-icon-wrap-test')
