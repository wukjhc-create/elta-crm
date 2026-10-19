/**
 * Mailagentens resultattekst i mail-detaljen kan krympe. Beskeden bliver.
 *   npx tsx scripts/mail-agent-result-wrap-test.ts
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
const id = 'data-testid="mail-agent-result"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 110, at + 10) : ''
const cell = 'className={`text-sm break-words min-w-0 ${agentResult.ok ? \'text-green-700\' : \'text-red-600\'}`} data-testid="mail-agent-result"'
ok(row.includes('<span'), 'det er resultatteksten')
ok(row.includes('break-words min-w-0'), 'resultatteksten kan krympe')
ok(row.includes('text-green-700'), 'groen farve bliver i vinduet')
ok(row.includes('text-red-600'), 'roed farve bliver i vinduet')
ok(!row.includes('agentResult.msg'), 'beskeden er et andet sted')
ok(!row.includes('Kør Mailagent'), 'knapteksten er et andet sted')
ok(!row.includes('mail-agent-button'), 'knappen er et andet sted')
ok(!row.includes('mail-agent-row'), 'raekken er et andet sted')
ok(!row.includes('mail-detail-header'), 'sidehovedet er et andet sted')
ok(view.split(id).length === 2, 'resultatet findes en gang')
ok(view.split(cell).length === 2, 'resultatklassen findes en gang')
ok(view.split('className={`text-sm ${agentResult.ok ? \'text-green-700\' : \'text-red-600\'}`}').length === 1, 'den bare resultattekst er vaek')
ok(view.split('data-testid="mail-agent-button"').length === 2, 'knap-id kolliderer ikke')
ok(view.split('data-testid="mail-agent-row"').length === 2, 'raekke-id kolliderer ikke')
ok(view.includes('{agentResult.msg}'), 'beskeden bliver')
ok(view.includes('href="/dashboard/agents"'), 'indbakkelinket bliver')
ok(view.includes("{agentRunning ? 'Kører Mailagent…' : 'Kør Mailagent'}"), 'knapteksten bliver')
ok(view.includes('data-testid="mail-agent-button"'), 'knappen bliver')
ok(view.includes('>Ulæst</span>'), 'ulaest bliver')
ok(view.includes('data-testid="mail-received-at">{formatDate(email.received_at)}'), 'tidspunktet bliver')
ok(view.includes('href={lightboxUrl}'), 'linket bliver')
ok(view.includes('text-[11px] text-white line-clamp-2 break-all">{att.filename}'), 'filnavnet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-agent-result-wrap-test')
