/**
 * Linket Abn Agent Inbox i mail-detaljen kan krympe. Linkteksten bliver.
 *   npx tsx scripts/mail-agent-inbox-link-wrap-test.ts
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
const id = 'data-testid="mail-agent-inbox-link"'
const at = view.indexOf(id)
const row = at >= 0 ? view.slice(at - 100, at + 10) : ''
const cell = 'className="ml-2 text-blue-600 hover:underline break-words min-w-0" data-testid="mail-agent-inbox-link"'
ok(row.includes('<a'), 'det er linket')
ok(row.includes('break-words min-w-0'), 'linket kan krympe')
ok(row.includes('href="/dashboard/agents"'), 'href sidder paa linket')
ok(!row.includes('Åbn Agent Inbox'), 'linkteksten er et andet sted')
ok(!row.includes('mail-agent-result'), 'resultatet er et andet sted')
ok(!row.includes('mail-agent-button'), 'knappen er et andet sted')
ok(!row.includes('mail-agent-row'), 'raekken er et andet sted')
ok(!row.includes('agentResult.msg'), 'beskeden er et andet sted')
ok(!row.includes('Kør Mailagent'), 'knapteksten er et andet sted')
ok(view.split(id).length === 2, 'linket findes en gang')
ok(view.split(cell).length === 2, 'linkklassen findes en gang')
ok(view.split('className="ml-2 text-blue-600 hover:underline"').length === 1, 'det bare link er vaek')
ok(view.split('data-testid="mail-agent-result"').length === 2, 'resultat-id kolliderer ikke')
ok(view.split('data-testid="mail-agent-button"').length === 2, 'knap-id kolliderer ikke')
ok(view.split('data-testid="mail-agent-row"').length === 2, 'raekke-id kolliderer ikke')
ok(view.includes('href="/dashboard/agents"'), 'href bliver')
ok(view.includes('Åbn Agent Inbox →'), 'linkteksten bliver')
ok(view.includes('{agentResult.msg}'), 'beskeden bliver')
ok(view.includes('data-testid="mail-agent-result"'), 'resultatet bliver')
ok(view.includes("{agentRunning ? 'Kører Mailagent…' : 'Kør Mailagent'}"), 'knapteksten bliver')
ok(view.includes('>Ulæst</span>'), 'ulaest bliver')
ok(view.includes('data-testid="mail-received-at">{formatDate(email.received_at)}'), 'tidspunktet bliver')
ok(view.includes('href={lightboxUrl}'), 'lysbokslinket bliver')
ok(view.includes('text-[11px] text-white line-clamp-2 break-all">{att.filename}'), 'filnavnet bliver')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  mail-agent-inbox-link-wrap-test')
