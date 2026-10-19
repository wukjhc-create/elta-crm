/**
 * Svaret efter hurtigsvar i mail-detaljen kan krympe. Teksten bliver.
 *   npx tsx scripts/mail-reply-msg-wrap-test.ts
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
const id = 'data-testid="mail-reply-msg"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 160, at + 10) : ''
const bare = "className={`text-xs ${replyMsg.startsWith('Fejl') || replyMsg.startsWith('Manglende') ? 'text-red-600' : 'text-green-600 font-medium'}`}"
const cell = "className={`text-xs ${replyMsg.startsWith('Fejl') || replyMsg.startsWith('Manglende') ? 'text-red-600' : 'text-green-600 font-medium'} break-words min-w-0`} data-testid=\"mail-reply-msg\""
ok(row.includes('<p '), 'det er svaret')
ok(row.includes("replyMsg.startsWith('Fejl')"), 'fejltonen bliver')
ok(row.includes('text-red-600'), 'fejlfarven bliver')
ok(row.includes('text-green-600 font-medium'), 'ok-tonen bliver')
ok(row.includes('break-words min-w-0'), 'svaret kan krympe')
ok(!row.includes('{replyMsg}'), 'teksten er et andet sted')
ok(!row.includes('mail-reply-stack'), 'stakken er et andet sted')
ok(!row.includes('mail-graph-diag-line'), 'diagnoselinjen er et andet sted')
ok(view.split(id).length === 2, 'svaret findes en gang')
ok(view.split(cell).length === 2, 'svarklassen findes en gang')
ok(view.split(bare).length === 1, 'den bare klasse er vaek')
ok(view.split('data-testid="mail-reply-stack"').length === 2, 'stak-id kolliderer ikke')
ok(view.split('data-testid="mail-restore-button"').length === 2, 'relevant-id kolliderer ikke')
ok(view.split('data-testid="mail-received-at"').length === 2, 'tid-id kolliderer ikke')
ok(view.includes('{replyMsg}'), 'teksten bliver')
ok(view.includes('data-testid="mail-reply-stack"'), 'stakken bliver')
ok(view.includes('data-testid="mail-graph-diag-line"'), 'diagnoselinjen bliver')
ok(view.includes("{val ? '✓' : '✗'}"), 'markeringen bliver')
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
console.log('PASS  mail-reply-msg-wrap-test')
