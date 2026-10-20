/**
 * Note-svaret citerer de foerste 120 tegn af den gemte tekst.
 *   npx tsx scripts/assistant-note-reply-test.ts
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

const short = 'kunden ønsker hvid'
ok(noteSavedReply('SVC-01019', short) === `📝 Note gemt på SVC-01019. "${short}"`, 'kort tekst citeres helt')

const exact = 'æ'.repeat(120)
ok(noteSavedReply('Kunde', exact) === `📝 Note gemt på Kunde. "${exact}"`, '120 tegn citeres helt')

const long = 'A'.repeat(120) + 'Z'
const quoted = noteSavedReply('Sag', long)
ok(quoted.includes('A'.repeat(120)), 'de foerste 120 er med')
ok(!quoted.includes('Z'), 'tegn 121 er ude')
ok(quoted.startsWith('📝 Note gemt på Sag.'), 'sagen naevnes')

const run = readFileSync('src/lib/assistant/run-command.ts', 'utf8')
ok(run.split('noteSavedReply(target.label, body)').length === 3, 'begge svar bruger citatet')
ok(run.includes(".from('case_notes').insert({ case_id: target.id, content: body, kind: 'note', urgency: null, source, created_by: actor.profileId })"), 'sags-insert bliver')
ok(run.includes(".from('customer_notes').insert({ customer_id: target.id, content: body, source, created_by: actor.profileId })"), 'kunde-insert bliver')
ok(run.includes("buttons: [{ label: 'Åbn kunde', action: 'open_customer', ref: target.id }]"), 'kunde-knappen bliver')

const send = readFileSync('src/lib/assistant/telegram/handle-update.ts', 'utf8')
ok(!send.includes('noteSavedReply'), 'afsendelsen er uændret')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  assistant-note-reply-test')
