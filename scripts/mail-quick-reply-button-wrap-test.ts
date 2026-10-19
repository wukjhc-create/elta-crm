/**
 * Hurtigsvar-knapperne i mail-detaljen kan krympe. Teksterne bliver.
 *   npx tsx scripts/mail-quick-reply-button-wrap-test.ts
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
const id = 'data-testid="mail-quick-reply-button"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 440, at + 10) : ''
const bare = 'className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-700 rounded-md hover:bg-blue-50 hover:text-blue-700 border border-gray-200 hover:border-blue-300 transition-colors disabled:opacity-50"'
const cell = bare.slice(0, -1) + ' break-words min-w-0" data-testid="mail-quick-reply-button"'
ok(row.includes('<button'), 'det er knappen')
ok(row.includes('break-words min-w-0'), 'knappen kan krympe')
ok(row.includes('hover:border-blue-300'), 'kanten bliver')
ok(row.includes('bg-gray-100'), 'baggrunden bliver')
ok(row.includes('handleQuickReply(tpl.text)'), 'klikket bliver')
ok(row.includes('disabled={isSendingReply !== null}'), 'deaktiveringen bliver')
ok(!row.includes('Bekræft modtagelse'), 'teksten er et andet sted')
ok(!row.includes('mail-quick-reply-label'), 'overskriften er et andet sted')
ok(!row.includes('<Mail '), 'ikonet er et andet sted')
ok(!row.includes('animate-spin'), 'spinneren er et andet sted')
ok(!row.includes('flex items-center gap-2 flex-wrap'), 'raekken er et andet sted')
ok(view.split(id).length === 2, 'knappen findes en gang')
ok(view.split(cell).length === 2, 'knapklassen findes en gang')
ok(view.split(bare).length === 1, 'den bare klasse er vaek')
ok(view.split('data-testid="mail-quick-reply-label"').length === 2, 'overskrift-id kolliderer ikke')
ok(view.includes('Bekræft modtagelse'), 'bekraeft bliver')
ok(view.includes('Mangler info'), 'mangler-info bliver')
ok(view.includes('Tak for ordren'), 'tak-for-ordren bliver')
ok(view.includes('handleQuickReply(tpl.text)'), 'handleren bliver')
ok(view.includes('<Mail className="w-3 h-3 break-words min-w-0" data-testid="mail-quick-reply-icon" />'), 'det lille ikon bliver')
ok(view.includes('data-testid="mail-quick-reply-label"'), 'overskriften bliver')
ok(view.includes('>Hurtigt svar</p>'), 'overskriftsteksten bliver')
ok(view.includes('data-testid="mail-mark-read-button"'), 'laeseknappen bliver')
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
console.log('PASS  mail-quick-reply-button-wrap-test')
