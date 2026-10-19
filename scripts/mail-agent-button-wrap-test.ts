/**
 * Mailagent-knappen i mail-detaljen kan krympe. Teksten Kør Mailagent bliver.
 *   npx tsx scripts/mail-agent-button-wrap-test.ts
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
const id = 'data-testid="mail-agent-button"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 450, at + 10) : ''
const cell = 'className="inline-flex items-center gap-2 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed break-words min-w-0" data-testid="mail-agent-button"'
ok(row.includes('<button'), 'det er knappen')
ok(row.includes('break-words min-w-0'), 'knappen kan krympe')
ok(row.includes('handleRunMailAgent'), 'handleren sidder paa knappen')
ok(!row.includes('mail-agent-row'), 'raekken er et andet sted')
ok(!row.includes('Kør Mailagent'), 'knapteksten er et andet sted')
ok(!row.includes('mail-sender-row'), 'afsenderraekken er et andet sted')
ok(!row.includes('mail-detail-header'), 'sidehovedet er et andet sted')
ok(!row.includes('mail-detail-frame'), 'rammen er et andet sted')
ok(view.split(id).length === 2, 'knappen findes en gang')
ok(view.split(cell).length === 2, 'knapklassen findes en gang')
ok(view.split('className="inline-flex items-center gap-2 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed"').length === 1, 'den bare knap er vaek')
ok(view.split('data-testid="mail-agent-row"').length === 2, 'raekke-id kolliderer ikke')
ok(view.includes('onClick={handleRunMailAgent}'), 'handleren bliver')
ok(view.includes("{agentRunning ? 'Kører Mailagent…' : 'Kør Mailagent'}"), 'knapteksten bliver')
ok(view.includes('data-testid="mail-agent-row"'), 'raekken bliver')
ok(view.includes('className="flex flex-wrap items-center gap-3 break-words min-w-0" data-testid="mail-agent-row"'), 'raekkeklassen bliver')
ok(view.includes('>Ulæst</span>'), 'ulaest bliver')
ok(view.includes('data-testid="mail-received-at">{formatDate(email.received_at)}'), 'tidspunktet bliver')
ok(view.includes('href={lightboxUrl}'), 'linket bliver')
ok(view.includes('text-[11px] text-white line-clamp-2 break-all">{att.filename}'), 'filnavnet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-agent-button-wrap-test')
