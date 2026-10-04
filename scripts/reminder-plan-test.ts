/**
 * N89: unit-tests for rykkerreglerne (src/lib/invoices/reminder-plan.ts) — samme regler som invoice-reminders-cronen.
 *   npx tsx scripts/reminder-plan-test.ts
 */
import { nextReminder, pickReminderLevel } from '../src/lib/invoices/reminder-plan'

let failed = 0
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failed++
  console.log(`${ok ? '✓' : '❌'} ${name}${ok ? '' : ` — fik ${JSON.stringify(got)}, ville have ${JSON.stringify(want)}`}`)
}
eq('pick: 2 dage, ingen rykker → intet', pickReminderLevel(2, 0), null)
eq('pick: 3 dage → niveau 1', pickReminderLevel(3, 0), 1)
eq('pick: 12 dage efter rykker 1 → niveau 2', pickReminderLevel(12, 1), 2)
eq('pick: 25 dage uden rykkere → niveau 1 først', pickReminderLevel(25, 0), 1)
eq('pick: alle brugt', pickReminderLevel(60, 3), null)
eq('næste: 1 dag over forfald → rykker 1 om 2 dage', nextReminder(1, 0, null), { kind: 'mail', level: 1, inDays: 2 })
eq('næste: 4 dage → rykker 1 nu', nextReminder(4, 0, null), { kind: 'mail', level: 1, inDays: 0 })
eq('næste: rykker 1 sendt for 2 dage, 11 dage over → rykker 2 om 3 dage (pause)', nextReminder(11, 1, 2), { kind: 'mail', level: 2, inDays: 3 })
eq('næste: 20 dage efter rykker 2 → manuel gennemgang', nextReminder(20, 2, 10), { kind: 'manual', level: 3, inDays: 0 })
eq('næste: alle niveauer brugt', nextReminder(40, 3, 1), { kind: 'done', level: null, inDays: 0 })
if (failed) { console.log(`❌ ${failed} fejlede`); process.exit(1) }
console.log('✅ alle rykkerregel-tests bestået')
