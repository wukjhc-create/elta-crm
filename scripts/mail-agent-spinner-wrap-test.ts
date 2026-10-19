/**
 * Mailagent-spinneren i mail-detaljen kan krympe. Teksten Kor Mailagent bliver.
 * De andre spinner-ikoner bliver.
 *   npx tsx scripts/mail-agent-spinner-wrap-test.ts
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
const id = 'data-testid="mail-agent-spinner"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 62, at + 10) : ''
const bare = '<Loader2 className="w-4 h-4 animate-spin" />'
const cell = '<Loader2 className="w-4 h-4 animate-spin break-words min-w-0" data-testid="mail-agent-spinner" />'
ok(row.startsWith('<Loader2'), 'det er spinneren')
ok(row.includes('break-words min-w-0'), 'spinneren kan krympe')
ok(row.includes('animate-spin'), 'animationen bliver')
ok(!row.includes('Mail'), 'teksten er et andet sted')
ok(!row.includes('agentRunning'), 'tilstanden er et andet sted')
ok(!row.includes('Bot'), 'ikonet er et andet sted')
ok(!row.includes('\n'), 'linjeskiftet er et andet sted')
ok(view.split(id).length === 2, 'spinneren findes en gang')
ok(view.split(cell).length === 2, 'spinnerklassen findes en gang')
ok(view.split(bare).length === 3, 'de andre spinner-ikoner bliver')
ok(view.includes('Kør Mailagent'), 'teksten bliver')
ok(view.includes("{agentRunning ? 'Kører Mailagent…' : 'Kør Mailagent'}"), 'knapteksten bliver')
ok(view.includes('data-testid="mail-agent-icon"'), 'mailagent-ikonet bliver')
ok(view.includes('data-testid="mail-agent-button"'), 'mailagent-knappen bliver')
const agentAt = view.indexOf('{agentRunning ? <Loader2')
const sagAt = view.indexOf('{isCreatingServiceCase ? <Loader2')
const agentSlice = agentAt >= 0 ? view.slice(agentAt, agentAt + 160) : ''
const sagSlice = sagAt >= 0 ? view.slice(sagAt, sagAt + 80) : ''
ok(agentSlice.includes(id), 'spinneren er ved mailagent')
ok(!agentSlice.includes(bare), 'mailagent-spinneren er ikke bar')
ok(sagSlice.includes(bare), 'opret-sag-spinneren bliver bar')
ok(!sagSlice.includes(id), 'mailagent-spinneren er et andet sted')
ok(view.split('data-testid="mail-agent-icon"').length === 2, 'ikon-id kolliderer ikke')
ok(view.split('data-testid="mail-agent-button"').length === 2, 'knap-id kolliderer ikke')
ok(view.split('data-testid="mail-restore-spinner"').length === 2, 'relevant-id kolliderer ikke')
ok(view.includes('data-testid="mail-body-loading"'), 'indlaesningen bliver')
ok(view.includes('data-testid="mail-create-offer"'), 'opret-tilbud bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-agent-spinner-wrap-test')
