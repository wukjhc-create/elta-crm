/**
 * Svaret efter download af vedhaeftninger kan krympe. Beskeden bliver.
 *   npx tsx scripts/mail-backfill-msg-wrap-test.ts
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
const id = 'data-testid="mail-backfill-msg"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 120, at + 10) : ''
const cell = 'className={`text-sm ${backfillMsg.startsWith(\'Fejl\') ? \'text-red-600\' : \'text-green-700\'} break-words min-w-0`} data-testid="mail-backfill-msg"'
const bare = 'className={`text-sm ${backfillMsg.startsWith(\'Fejl\') ? \'text-red-600\' : \'text-green-700\'}`}'
ok(row.includes('<p'), 'det er afsnittet')
ok(row.includes('className'), 'klassen er paa afsnittet')
ok(row.includes('break-words min-w-0'), 'svaret kan krympe')
ok(row.includes('text-red-600'), 'fejlfarven bliver')
ok(row.includes('text-green-700'), 'ok-farven bliver')
ok(row.includes('Fejl'), 'fejlordet bliver')
ok(row.includes('backfillMsg'), 'variablen bliver')
ok(!row.includes('{backfillMsg}'), 'teksten er et andet sted')
ok(!row.includes('mail-attachments-download-button'), 'knappen er et andet sted')
ok(!row.includes('mail-attachments-pending-box'), 'boksen er et andet sted')
ok(!row.includes('Vedhæftningerne'), 'saetningen er et andet sted')
ok(!row.includes('Download vedhæftninger'), 'knapteksten er et andet sted')
ok(!row.includes('text-amber-800'), 'den gule tekst er et andet sted')
ok(!row.includes('handleBackfill'), 'handlingen er et andet sted')
ok(!row.includes('isBackfilling'), 'ventetilstanden er et andet sted')
ok(!row.includes('mail-case-feedback'), 'sagsvaret er et andet sted')
ok(!row.includes('line-clamp-2'), 'filnavnet er et andet sted')
ok(view.split(id).length === 2, 'svaret findes en gang')
ok(view.split(cell).length === 2, 'svarklassen findes en gang')
ok(view.split(bare).length === 1, 'den bare svarklasse er vaek')
ok(view.split('{backfillMsg}').length === 2, 'teksten bliver')
ok(view.split('backfillMsg.startsWith(\'Fejl\')').length === 2, 'betingelsen bliver')
ok(view.split('data-testid="mail-attachments-download-button"').length === 2, 'knap-id kolliderer ikke')
ok(view.split('data-testid="mail-attachments-pending-box"').length === 2, 'boks-id kolliderer ikke')
ok(view.split('data-testid="mail-case-feedback"').length === 2, 'sagsvar-id kolliderer ikke')
ok(view.includes('text-sm text-amber-800'), 'saetningens klasse bliver')
ok(view.includes('Vedhæftningerne er ikke downloadet endnu.'), 'saetningen bliver')
ok(view.includes('Download vedhæftninger nu'), 'knapteksten bliver')
ok(view.includes('data-testid="mail-body-loading"'), 'indlaesningen bliver')
ok(view.includes('>Ulæst</span>'), 'ulaest bliver')
ok(view.includes('data-testid="mail-received-at">{formatDate(email.received_at)}'), 'tidspunktet bliver')
ok(view.includes('href={lightboxUrl}'), 'lysbokslinket bliver')
ok(view.includes('text-[11px] text-white line-clamp-2 break-all">{att.filename}'), 'filnavnet bliver')
ok(view.includes('{feedback}'), 'sagsvaret bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-backfill-msg-wrap-test')
