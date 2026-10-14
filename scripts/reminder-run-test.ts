/**
 * Unit-test (ingen DB) for F-10 rykker-kørslens loft og rækkefølge (lib/invoices/reminder-limits.ts).
 *   npx tsx scripts/reminder-run-test.ts
 */
import { reminderRunExhausted, orderRemindersFailedLast, MAX_REMINDER_MAILS_PER_RUN, REMINDER_RUN_BUDGET_MS } from '../src/lib/invoices/reminder-limits'

let bad = 0
const ok = (c: boolean, label: string, note = '') => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${note ? ` — ${note}` : ''}`) }
ok(!reminderRunExhausted({ sent: MAX_REMINDER_MAILS_PER_RUN - 1, elapsedMs: 1000 }), 'under loftet: fortsæt')
ok(reminderRunExhausted({ sent: MAX_REMINDER_MAILS_PER_RUN, elapsedMs: 1000 }), 'loftet nået: stop')
ok(reminderRunExhausted({ sent: 0, elapsedMs: REMINDER_RUN_BUDGET_MS }), 'tidsbudget brugt: stop (hængende afsendelser)')
const inv = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }]
const ordered = orderRemindersFailedLast(inv, new Set(['a', 'b', 'c']))
ok(ordered.map((i) => i.id).join('') === 'deabc', 'nyligt fejlede tages sidst, ellers uændret rækkefølge', ordered.map((i) => i.id).join(''))
// Scenarie fra reviewet: de 3 ældste fejler hver dag → de øvrige får nu rykker
let sent = 0
for (const i of ordered) { if (reminderRunExhausted({ sent, elapsedMs: 0 })) break; if (!['a', 'b', 'c'].includes(i.id)) sent++ }
ok(sent === 2, '3 permanent fejlende ældste fakturaer blokerer ikke de 2 øvrige', `sendt=${sent}`)
console.log(bad ? `\n❌ ${bad} fejl` : '\n✅ rykker-kørsel ok')
process.exitCode = bad ? 1 : 0
