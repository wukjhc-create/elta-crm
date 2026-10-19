/**
 * Svarstakken efter hurtigsvar i mail-detaljen kan krympe. Svaret bliver.
 *   npx tsx scripts/mail-reply-stack-wrap-test.ts
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
const id = 'data-testid="mail-reply-stack"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 50, at + 10) : ''
const bare = 'className="space-y-1"'
const cell = '<div className="space-y-1 break-words min-w-0" data-testid="mail-reply-stack">'
ok(row.includes('<div '), 'det er stakken')
ok(row.includes('space-y-1'), 'afstanden bliver')
ok(row.includes('break-words min-w-0'), 'stakken kan krympe')
ok(!row.includes('{replyMsg}'), 'svaret er et andet sted')
ok(!row.includes('replyMsg'), 'svarvariablen er et andet sted')
ok(!row.includes('text-red-600'), 'fejlfarven er et andet sted')
ok(!row.includes('text-green-600'), 'ok-farven er et andet sted')
ok(!row.includes('space-y-1.5'), 'fillisten er et andet sted')
ok(!row.includes('mail-graph-diagnose'), 'diagnosen er et andet sted')
ok(!row.includes('Diagnosticér'), 'diagnoseteksten er et andet sted')
ok(!row.includes('mail-quick-reply-row'), 'hurtigsvar-raekken er et andet sted')
ok(view.split(id).length === 2, 'stakken findes en gang')
ok(view.split(cell).length === 2, 'stakklassen findes en gang')
ok(view.split(bare).length === 1, 'den bare klasse er vaek')
ok(view.split('className="space-y-1.5"').length === 2, 'fillisten bliver bar')
ok(view.split('data-testid="mail-graph-diagnose"').length === 2, 'diagnose-id kolliderer ikke')
ok(view.split('data-testid="mail-quick-reply-row"').length === 2, 'raekke-id kolliderer ikke')
ok(view.split('data-testid="mail-restore-button"').length === 2, 'relevant-id kolliderer ikke')
ok(view.includes('{replyMsg}'), 'svaret bliver')
ok(view.includes("replyMsg.startsWith('Fejl')"), 'fejltonen bliver')
ok(view.includes('text-green-600 font-medium'), 'ok-tonen bliver')
ok(view.includes('data-testid="mail-graph-diagnose"'), 'diagnosen bliver')
ok(view.includes('Diagnosticér Graph-forbindelse'), 'diagnoseteksten bliver')
ok(view.includes('onClick={handleDiagnoseGraph}'), 'diagnoseklikket bliver')
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
console.log('PASS  mail-reply-stack-wrap-test')
