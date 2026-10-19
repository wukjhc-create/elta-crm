/**
 * Mailagent-ikonet i mail-detaljen kan krympe. Teksten bliver.
 *   npx tsx scripts/mail-agent-icon-wrap-test.ts
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
const id = 'data-testid="mail-agent-icon"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 50, at + 10) : ''
const bare = '<Bot className="w-4 h-4" />'
const cell = '<Bot className="w-4 h-4 break-words min-w-0" data-testid="mail-agent-icon" />'
ok(row.includes('<Bot'), 'det er ikonet')
ok(row.includes('break-words min-w-0'), 'ikonet kan krympe')
ok(!row.includes('Mailagent'), 'teksten er et andet sted')
ok(!row.includes('mail-agent-button'), 'knappen er et andet sted')
ok(!row.includes('Loader2'), 'spinneren er et andet sted')
ok(!row.includes('agentRunning'), 'tilstanden er et andet sted')
ok(view.split(id).length === 2, 'ikonet findes en gang')
ok(view.split(cell).length === 2, 'ikonklassen findes en gang')
ok(view.split(bare).length === 1, 'det bare ikon er vaek')
ok(view.includes('Kør Mailagent'), 'teksten bliver')
ok(view.includes('data-testid="mail-agent-button"'), 'knappen bliver')
ok(view.includes('data-testid="mail-agent-row"'), 'raekken bliver')
ok(view.includes('<Download className="w-4 h-4 break-words min-w-0" data-testid="mail-pending-dl-icon" />'), 'download-ikonet bliver')
ok(view.includes('Download vedhæftninger nu'), 'download-teksten bliver')
ok(view.includes('data-testid="mail-body-loading"'), 'indlaesningen bliver')
ok(view.includes('data-testid="mail-create-offer"'), 'opret-tilbud bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-agent-icon-wrap-test')
