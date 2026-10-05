/**
 * Unit-tests for "påmindelse sendt"-markøren (src/lib/tasks/reminder-marker.ts). Ingen DB.
 *   npx tsx scripts/reminder-marker-test.ts
 */
import { markReminderSent, reminderAlreadySent, REMINDER_MARK } from '../src/lib/tasks/reminder-marker'

let bad = 0
const ok = (c: boolean, label: string, extra = '') => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`) }
const now = new Date('2026-10-04T23:30:00Z') // 5/10 kl. 01:30 dansk tid

const text = 'Adresse: Solvej 1, 8000 Aarhus\nNøgle under måtten'
const marked = markReminderSent(text, now)
ok(marked.startsWith(text), 'almindelig tekst bevares (før: erstattet af JSON)', JSON.stringify(marked))
ok(marked.endsWith(`${REMINDER_MARK} 2026-10-05]`), 'markør med dansk dato')
ok(!reminderAlreadySent(text) && reminderAlreadySent(marked), 'markør genkendes (ingen ny påmindelse)')

const json = JSON.stringify({ booked_by: 'portal', slot: '2026-10-10 09:00' })
const mj = JSON.parse(markReminderSent(json, now))
ok(mj.booked_by === 'portal' && mj.slot === '2026-10-10 09:00' && mj.reminder_sent === now.toISOString(), 'JSON-beskrivelse beholder felterne')
ok(reminderAlreadySent(JSON.stringify({ reminder_sent: '2026-03-19T05:00:00Z' })), 'gammel JSON-markør genkendes')
ok(markReminderSent(null, now) === `${REMINDER_MARK} 2026-10-05]` && markReminderSent('', now) === `${REMINDER_MARK} 2026-10-05]`, 'tom beskrivelse')
ok(markReminderSent('[1,2]', now).startsWith('[1,2]\n'), 'JSON-array behandles som tekst')

console.log(bad ? `\n❌ ${bad} fejl` : '\n✅ alle markør-tests bestået')
process.exitCode = bad ? 1 : 0
