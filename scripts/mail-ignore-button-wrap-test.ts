/**
 * Knappen Ignorer i mail-detaljen kan krympe. Teksten bliver.
 *   npx tsx scripts/mail-ignore-button-wrap-test.ts
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
const id = 'data-testid="mail-ignore-button"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 340, at + 10) : ''
const bare = 'className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border rounded-md hover:bg-gray-50 text-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"'
const cell = bare.slice(0, -1) + ' break-words min-w-0" data-testid="mail-ignore-button"'
const archiveBare = 'className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed break-words min-w-0" data-testid="mail-archive-button"'
ok(row.includes('<button'), 'det er knappen')
ok(row.includes('hover:bg-gray-50'), 'hover bliver')
ok(row.includes('text-gray-500'), 'farven bliver')
ok(row.includes('break-words min-w-0'), 'knappen kan krympe')
ok(row.includes('disabled={pendingAction !== null}'), 'deaktiveringen bliver')
ok(row.includes("runHeaderAction('ignore', onIgnore)"), 'klikket bliver')
ok(!row.includes('Ignorér'), 'teksten er et andet sted')
ok(!row.includes('mail-ignore-icon'), 'ikonet er et andet sted')
ok(!row.includes('<EyeOff'), 'ikon-tagget er et andet sted')
ok(!row.includes('animate-spin'), 'spinneren er et andet sted')
ok(!row.includes('link_status'), 'betingelsen er et andet sted')
ok(!row.includes('Arkivér'), 'arkivteksten er et andet sted')
ok(!row.includes('mail-restore-button'), 'relevant-knappen er et andet sted')
ok(view.split(id).length === 2, 'knappen findes en gang')
ok(view.split(cell).length === 2, 'knapklassen findes en gang')
ok(view.split(bare).length === 1, 'den bare klasse er vaek')
ok(view.split('data-testid="mail-ignore-icon"').length === 2, 'ikon-id kolliderer ikke')
ok(view.includes('Ignorér'), 'teksten bliver')
ok(view.includes("runHeaderAction('ignore', onIgnore)"), 'handleren bliver')
ok(view.includes("link_status === 'unidentified'"), 'betingelsen bliver')
ok(view.includes('data-testid="mail-ignore-icon"'), 'ikonet bliver')
ok(view.includes(archiveBare), 'arkivknappen bliver')
ok(view.includes('Arkivér'), 'arkivteksten bliver')
ok(view.includes('data-testid="mail-archive-icon"'), 'arkivikonet bliver')
ok(view.includes('data-testid="mail-restore-button"'), 'relevant-knappen bliver')
ok(view.includes('Markér som relevant'), 'relevant-teksten bliver')
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
console.log('PASS  mail-ignore-button-wrap-test')
