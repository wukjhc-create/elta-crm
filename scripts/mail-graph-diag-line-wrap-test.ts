/**
 * Graph-diagnosens linje i mail-detaljen kan krympe. Noeglen bliver.
 *   npx tsx scripts/mail-graph-diag-line-wrap-test.ts
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
const id = 'data-testid="mail-graph-diag-line"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 110, at + 10) : ''
const bare = "className={val ? 'text-green-700' : 'text-red-600 font-bold'}"
const cell = "className={(val ? 'text-green-700' : 'text-red-600 font-bold') + ' break-words min-w-0'} data-testid=\"mail-graph-diag-line\""
ok(row.includes('<div '), 'det er linjen')
ok(row.includes('key={key}'), 'react-noeglen bliver')
ok(row.includes('text-green-700'), 'ok-farven bliver')
ok(row.includes('text-red-600 font-bold'), 'fejl-farven bliver')
ok(row.includes('break-words min-w-0'), 'linjen kan krympe')
ok(!row.includes('✓'), 'markeringen er et andet sted')
ok(!row.includes('mail-graph-diag-frame'), 'rammen er et andet sted')
ok(!row.includes('Object.entries'), 'opslaget er et andet sted')
ok(!row.includes('mail-graph-diagnose'), 'diagnoseknappen er et andet sted')
ok(!row.includes('mail-reply-stack'), 'svarstakken er et andet sted')
ok(view.split(id).length === 2, 'linjen findes en gang')
ok(view.split(cell).length === 2, 'linjeklassen findes en gang')
ok(view.split(bare).length === 1, 'den bare klasse er vaek')
ok(view.includes("val ? 'text-green-700' : 'text-red-600 font-bold'"), 'farvevalget bliver')
ok(view.split('data-testid="mail-graph-diag-frame"').length === 2, 'ramme-id kolliderer ikke')
ok(view.split('data-testid="mail-graph-diagnose"').length === 2, 'knap-id kolliderer ikke')
ok(view.split('data-testid="mail-reply-stack"').length === 2, 'stak-id kolliderer ikke')
ok(view.includes('{key}'), 'noeglen bliver')
ok(view.includes("{val ? '✓' : '✗'}"), 'markeringen bliver')
ok(view.includes('Object.entries(graphDiag)'), 'opslaget bliver')
ok(view.includes('data-testid="mail-graph-diag-frame"'), 'rammen bliver')
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
console.log('PASS  mail-graph-diag-line-wrap-test')
