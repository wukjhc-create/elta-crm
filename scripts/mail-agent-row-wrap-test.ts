/**
 * Mailagent-raekken i mail-detaljen kan krympe. Knappen Kør Mailagent bliver.
 *   npx tsx scripts/mail-agent-row-wrap-test.ts
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
const id = 'data-testid="mail-agent-row"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 80, at + 10) : ''
const cell = 'className="flex flex-wrap items-center gap-3 break-words min-w-0" data-testid="mail-agent-row"'
ok(row.includes('<div'), 'det er raekken')
ok(row.includes('flex flex-wrap items-center gap-3 break-words min-w-0'), 'raekken kan krympe')
ok(!row.includes('mail-sender-row'), 'afsenderraekken er et andet sted')
ok(!row.includes('mail-detail-header'), 'sidehovedet er et andet sted')
ok(!row.includes('mail-detail-frame'), 'rammen er et andet sted')
ok(!row.includes('<button'), 'knappen er et andet sted')
ok(!row.includes('handleRunMailAgent'), 'handleren er et andet sted')
ok(!row.includes('Kør Mailagent'), 'knapteksten er et andet sted')
ok(!row.includes('border-indigo-200'), 'knapklassen er et andet sted')
ok(view.split(id).length === 2, 'raekken findes en gang')
ok(view.split(cell).length === 2, 'raekkens klasse findes en gang')
ok(view.split('className="flex flex-wrap items-center gap-3"').length === 1, 'den bare raekke er vaek')
ok(view.split('data-testid="mail-sender-row"').length === 2, 'afsender-id kolliderer ikke')
ok(view.split('data-testid="mail-detail-header"').length === 2, 'sidehoved-id kolliderer ikke')
ok(view.split('data-testid="mail-detail-frame"').length === 2, 'ramme-id kolliderer ikke')
ok(view.includes('onClick={handleRunMailAgent}'), 'handleren bliver')
ok(view.includes("{agentRunning ? 'Kører Mailagent…' : 'Kør Mailagent'}"), 'knapteksten bliver')
ok(view.includes('className="inline-flex items-center gap-2 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed"'), 'knapklassen bliver')
ok(view.includes('data-testid="mail-detail-frame"'), 'rammen bliver')
ok(view.includes('data-testid="mail-detail-header"'), 'sidehovedet bliver')
ok(view.includes('data-testid="mail-sender-row"'), 'afsenderraekken bliver')
ok(view.includes('>Ulæst</span>'), 'ulaest bliver')
ok(view.includes('data-testid="mail-received-at">{formatDate(email.received_at)}'), 'tidspunktet bliver')
ok(view.includes('href={lightboxUrl}'), 'linket bliver')
ok(view.includes('text-[11px] text-white line-clamp-2 break-all">{att.filename}'), 'filnavnet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-agent-row-wrap-test')
