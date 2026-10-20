/**
 * Callback-svaret siger at kunden ikke er kontaktet.
 *   npx tsx scripts/assistant-callback-reply-test.ts
 */
import { readFileSync } from 'node:fs'
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

const reply = callbackSavedReply('Ring til Hansen', 'onsdag kl. 10:00', 'onsdag kl. 09:45')
ok(reply === '📞 Ring til Hansen — onsdag kl. 10:00 (påmindelse onsdag kl. 09:45). Ligger i CRM. Kunden er ikke kontaktet.', 'svaret siger at kunden ikke er kontaktet')
ok(reply.startsWith('📞 Ring til Hansen'), 'titlen bliver')
ok(!reply.includes('webhook'), 'svaret naevner ingen webhook')

const run = readFileSync('src/lib/assistant/run-command.ts', 'utf8')
ok(run.split('callbackSavedReply(title, fmtWhen(due), fmtWhen(reminderAt))').length === 2, 'kun callback-svaret bruger funktionen')
ok(run.includes('`⏰ ${title} — ${fmtWhen(due)} (påmindelse ${fmtWhen(reminderAt)}). Ligger i CRM.`'), 'paamindelsen er uaendret')
ok(run.includes("await admin.from('customer_tasks').insert({"), 'insert bliver')
ok(run.includes('customer_id: target.customerId,'), 'kunde-id bliver')
ok(run.includes('service_case_id: target.kind === \'case\' ? target.id : null,'), 'sag-id bliver')
ok(run.includes('title: title.slice(0, 200),'), 'titel-feltet bliver')
ok(run.includes('due_date: due,'), 'forfald bliver')
ok(run.includes('reminder_at: reminderAt,'), 'paamindelsestid bliver')
ok(run.includes("auto_rule: cmd.intent === 'callback' ? ASSISTANT_RULE.callback : ASSISTANT_RULE.reminder,"), 'reglen bliver')
ok(run.includes("await audit(admin, actor, cmd.intent === 'callback' ? 'callback_created' : 'reminder_created', taskId, title, { target_kind: target.kind, target_id: target.id, due })"), 'audit bliver')
ok(run.includes("buttons: [{ label: 'Åbn kunde', action: 'open_customer', ref: target.customerId! }]"), 'kunde-knappen bliver')

const send = readFileSync('src/lib/assistant/telegram/handle-update.ts', 'utf8')
ok(!send.includes('callbackSavedReply'), 'afsendelsen er uaendret')
ok(!send.includes('Kunden er ikke kontaktet'), 'saetningen sendes ikke herfra')

if (bad > 0) {
  console.log(`FAIL  ${bad}`)
  process.exit(1)
}
console.log('PASS  assistant-callback-reply-test')
