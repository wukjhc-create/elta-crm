/**
 * CR-1/CR-2 (cron-review 2026-10-17): rykker-kontakter. Ren logik, ingen I/O.
 *   npx tsx scripts/reminder-switches-test.ts
 */
import { invoiceRemindersLive, followUpRemindersPaused } from '../src/lib/reminders/reminder-switches'
import { runSendReminder } from '../src/lib/automation/actions/send-reminder'

let bad = 0
const ok = (c: boolean, label: string) => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`) }

ok(!invoiceRemindersLive({}), 'betalingsrykkere: ikke sat → fra')
ok(!invoiceRemindersLive({ INVOICE_REMINDERS_LIVE: '' }), 'betalingsrykkere: tom → fra')
ok(!invoiceRemindersLive({ INVOICE_REMINDERS_LIVE: 'false' }), 'betalingsrykkere: false → fra')
ok(!invoiceRemindersLive({ INVOICE_REMINDERS_LIVE: '1' }), 'betalingsrykkere: 1 → fra (kun "true")')
ok(invoiceRemindersLive({ INVOICE_REMINDERS_LIVE: 'true' }), 'betalingsrykkere: true → til')
ok(invoiceRemindersLive({ INVOICE_REMINDERS_LIVE: ' TRUE ' }), 'betalingsrykkere: TRUE med mellemrum → til')
ok(!followUpRemindersPaused({}), 'fuldmagt/besigtigelse: ikke sat → kører (uændret)')
ok(!followUpRemindersPaused({ FOLLOWUP_REMINDERS_PAUSED: 'false' }), 'fuldmagt/besigtigelse: false → kører')
ok(followUpRemindersPaused({ FOLLOWUP_REMINDERS_PAUSED: 'true' }), 'fuldmagt/besigtigelse: true → pauset')

// regel-motorens send_reminder: uden kontakten springes over FØR fakturamodulet (og DB) røres
async function action() {
  delete process.env.INVOICE_REMINDERS_LIVE
  const ctx = { event: { entityId: '00000000-0000-0000-0000-000000000000', globalDryRun: false }, rule: { dry_run: false } } as never
  const r = await runSendReminder(ctx)
  ok(r.ok && /INVOICE_REMINDERS_LIVE/.test(r.message ?? '') && (r.data as { skipped?: string }).skipped === 'reminders_not_live', 'send_reminder uden kontakt → sprunget over (intet sendt)')
  const dry = await runSendReminder({ event: { entityId: 'x', globalDryRun: false }, rule: { dry_run: true } } as never)
  ok(dry.message === 'dry_run', 'send_reminder i dry-run → dry_run (uændret)')
}
action().then(() => {
  console.log(bad ? `❌ ${bad} fejl` : '✅ alle bestået')
  process.exitCode = bad ? 1 : 0
})
