/**
 * Graph-diagnosens ramme i mail-detaljen kan krympe. Noeglerne bliver.
 *   npx tsx scripts/mail-graph-diag-frame-wrap-test.ts
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
const id = 'data-testid="mail-graph-diag-frame"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 110, at + 10) : ''
const bare = 'className="bg-gray-50 border rounded p-2 text-[11px] font-mono space-y-0.5"'
const cell = 'className="bg-gray-50 border rounded p-2 text-[11px] font-mono space-y-0.5 break-words min-w-0" data-testid="mail-graph-diag-frame"'
ok(row.includes('<div '), 'det er rammen')
ok(row.includes('font-mono'), 'skriften bliver')
ok(row.includes('space-y-0.5'), 'afstanden bliver')
ok(row.includes('bg-gray-50'), 'baggrunden bliver')
ok(row.includes('break-words min-w-0'), 'rammen kan krympe')
ok(!row.includes('{key}'), 'noeglen er et andet sted')
ok(!row.includes('graphDiag'), 'diagnosen er et andet sted')
ok(!row.includes('mail-reply-stack'), 'svarstakken er et andet sted')
ok(!row.includes('text-green-700'), 'ok-linjen er et andet sted')
ok(!row.includes('text-red-600'), 'fejl-linjen er et andet sted')
ok(!row.includes('mail-graph-diagnose'), 'diagnoseknappen er et andet sted')
ok(view.split(id).length === 2, 'rammen findes en gang')
ok(view.split(cell).length === 2, 'rammeklassen findes en gang')
ok(view.split(bare).length === 1, 'den bare klasse er vaek')
ok(view.split('data-testid="mail-graph-diagnose"').length === 2, 'knap-id kolliderer ikke')
ok(view.split('data-testid="mail-reply-stack"').length === 2, 'stak-id kolliderer ikke')
ok(view.split('data-testid="mail-quick-reply-row"').length === 2, 'raekke-id kolliderer ikke')
ok(view.includes('{key}'), 'noeglen bliver')
ok(view.includes('Object.entries(graphDiag)'), 'opslaget bliver')
ok(view.includes("val ? 'text-green-700' : 'text-red-600 font-bold'"), 'linjefarven bliver')
ok(view.includes("{val ? '✓' : '✗'}"), 'markeringen bliver')
ok(view.includes('data-testid="mail-reply-stack"'), 'svarstakken bliver')
ok(view.includes('{replyMsg}'), 'svaret bliver')
ok(view.includes('data-testid="mail-graph-diagnose"'), 'diagnoseknappen bliver')
ok(view.includes('Diagnosticér Graph-forbindelse'), 'diagnoseteksten bliver')
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
console.log('PASS  mail-graph-diag-frame-wrap-test')
