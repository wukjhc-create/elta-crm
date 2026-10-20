/**
 * Paamindelses-svaret siger at kunden ikke er kontaktet.
 *   npx tsx scripts/assistant-reminder-reply-test.ts
 */
import { readFileSync } from 'node:fs'
import { reminderSavedReply } from '../src/lib/assistant/reminder-reply'
import { callbackSavedReply } from '../src/lib/assistant/callback-reply'
import { formatDate } from '../src/lib/utils'
import { formatCurrency } from '../src/lib/utils/format'

let bad = 0
const ok = (c: boolean, label: string) => {
  if (!c) bad++
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`)
}

ok(formatDate('2026-06-02').includes('2026'), 'datoen bliver')
ok(formatCurrency(1250).includes('1'), 'beloebsformatet bliver')

const reply = reminderSavedReply('Følg op', 'onsdag kl. 10:00', 'onsdag kl. 10:00')
ok(reply === '⏰ Følg op — onsdag kl. 10:00 (påmindelse onsdag kl. 10:00). Ligger i CRM. Kunden er ikke kontaktet.', 'svaret siger at kunden ikke er kontaktet')
ok(reply.startsWith('⏰ Følg op'), 'titlen bliver')
ok(!reply.includes('webhook'), 'svaret naevner ingen webhook')
ok(callbackSavedReply('Ring til Hansen', 'onsdag kl. 10:00', 'onsdag kl. 09:45') === '📞 Ring til Hansen — onsdag kl. 10:00 (påmindelse onsdag kl. 09:45). Ligger i CRM. Kunden er ikke kontaktet.', 'callback-svaret bliver')

const run = readFileSync('src/lib/assistant/run-command.ts', 'utf8')
ok(run.split('reminderSavedReply(title, fmtWhen(due), fmtWhen(reminderAt))').length === 2, 'kun paamindelses-svaret bruger funktionen')
ok(!run.includes('`⏰ ${title} — ${fmtWhen(due)} (påmindelse ${fmtWhen(reminderAt)}). Ligger i CRM.`'), 'den gamle tekst er vaek')
ok(run.includes('`⏰ ${title} — ${fmtWhen(due)}. Ligger under "Mine påmindelser" i CRM.`'), 'den personlige tekst bliver')
ok(run.includes("await admin.from('customer_tasks').insert({"), 'insert bliver')
ok(run.includes('customer_id: target.customerId,'), 'kunde-id bliver')
ok(run.includes('due_date: due,'), 'forfald bliver')
ok(run.includes('reminder_at: reminderAt,'), 'paamindelsestid bliver')
ok(run.includes('callbackSavedReply(title, fmtWhen(due), fmtWhen(reminderAt))'), 'callback-kaldet bliver')

const send = readFileSync('src/lib/assistant/telegram/handle-update.ts', 'utf8')
ok(!send.includes('reminderSavedReply'), 'afsendelsen er uaendret')
ok(!send.includes('Kunden er ikke kontaktet'), 'saetningen sendes ikke herfra')

const sender = readFileSync('src/lib/assistant/telegram/reminder-sender.ts', 'utf8')
ok(sender.includes('`⏰ ${r.title}${when ? ` kl. ${when}` : \'\'}`'), 'udsendelsen bliver')
ok(!sender.includes('Kunden er ikke kontaktet'), 'udsendelsen siger ikke saetningen')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  assistant-reminder-reply-test')
