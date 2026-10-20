/**
 * Note-svaret viser at citatet er forkortet naar teksten er laengere end 120 tegn.
 * Insert og afsendelse bliver.
 *   npx tsx scripts/assistant-note-truncation-test.ts
 */
import { readFileSync } from 'node:fs'
import { noteSavedReply } from '../src/lib/assistant/note-reply'
import { formatDate } from '../src/lib/utils'
import { formatCurrency } from '../src/lib/utils/format'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

ok(formatDate('2026-06-02').includes('2026'), 'datoen bliver')
ok(formatCurrency(1250).includes('1'), 'beloebsformatet bliver')

const short = noteSavedReply('SVC-01019', 'kunden ønsker hvid')
ok(short === '📝 Note gemt på SVC-01019. "kunden ønsker hvid"', 'kort tekst citeres helt')
ok(!short.includes('…'), 'kort tekst er ikke forkortet')

const exact = 'æ'.repeat(120)
const full = noteSavedReply('Kunde', exact)
ok(full === `📝 Note gemt på Kunde. "${exact}"`, '120 tegn citeres helt')
ok(!full.includes('…'), '120 tegn er ikke forkortet')

const long = 'A'.repeat(120) + 'Z'
const quoted = noteSavedReply('Sag', long)
ok(quoted === `📝 Note gemt på Sag. "${'A'.repeat(120)}…"`, 'langt citat viser forkortelsen')
ok(!quoted.includes('Z'), 'tegn 121 er ude')

const run = readFileSync('src/lib/assistant/run-command.ts', 'utf8')
ok(run.includes(".from('case_notes').insert({ case_id: target.id, content: body, kind: 'note', urgency: null, source, created_by: actor.profileId })"), 'sags-insert bliver')
ok(run.includes(".from('customer_notes').insert({ customer_id: target.id, content: body, source, created_by: actor.profileId })"), 'kunde-insert bliver')
const send = readFileSync('src/lib/assistant/telegram/handle-update.ts', 'utf8')
ok(!send.includes('noteSavedReply'), 'afsendelsen er uændret')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  assistant-note-truncation-test')
