/**
 * Knappen Diagnosticer Graph-forbindelse i mail-detaljen kan krympe. Teksten bliver.
 *   npx tsx scripts/mail-graph-diagnose-wrap-test.ts
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
const id = 'data-testid="mail-graph-diagnose"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 160, at + 10) : ''
const bare = 'className="text-[10px] text-gray-400 hover:text-blue-600 underline"'
const cell = 'className="text-[10px] text-gray-400 hover:text-blue-600 underline break-words min-w-0" data-testid="mail-graph-diagnose"'
ok(row.includes('<button'), 'det er knappen')
ok(row.includes('handleDiagnoseGraph'), 'klikket bliver i knappen')
ok(row.includes('text-[10px]'), 'stoerrelsen bliver')
ok(row.includes('hover:text-blue-600'), 'farven bliver')
ok(row.includes('underline'), 'understregningen bliver')
ok(row.includes('break-words min-w-0'), 'knappen kan krympe')
ok(!row.includes('Diagnosticér'), 'teksten er et andet sted')
ok(!row.includes('replyMsg'), 'svaret er et andet sted')
ok(!row.includes('mail-quick-reply-row'), 'hurtigsvar-raekken er et andet sted')
ok(!row.includes('AI mail-assistent'), 'kommentaren er et andet sted')
ok(!row.includes('space-y-1'), 'svarstakken er et andet sted')
ok(view.split(id).length === 2, 'knappen findes en gang')
ok(view.split(cell).length === 2, 'knapklassen findes en gang')
ok(view.split(bare).length === 1, 'den bare klasse er vaek')
ok(view.split('data-testid="mail-quick-reply-row"').length === 2, 'raekke-id kolliderer ikke')
ok(view.split('data-testid="mail-quick-reply-frame"').length === 2, 'ramme-id kolliderer ikke')
ok(view.split('data-testid="mail-body-loading"').length === 2, 'indlaesnings-id kolliderer ikke')
ok(view.split('data-testid="mail-gallery-image-button"').length === 2, 'galleri-id kolliderer ikke')
ok(view.includes('Diagnosticér Graph-forbindelse'), 'teksten bliver')
ok(view.includes('onClick={handleDiagnoseGraph}'), 'handleren bliver')
ok(view.includes('data-testid="mail-quick-reply-row"'), 'hurtigsvar-raekken bliver')
ok(view.includes('Bekræft modtagelse'), 'bekraeft bliver')
ok(view.includes('Mangler info'), 'mangler-info bliver')
ok(view.includes('Tak for ordren'), 'tak-for-ordren bliver')
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
console.log('PASS  mail-graph-diagnose-wrap-test')
