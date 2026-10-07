/**
 * Unit-tests for cron-nødstoppet (CRON_PAUSED) i src/lib/services/cron-run.ts. Ingen DB.
 *   npx tsx scripts/cron-paused-test.ts
 */
import { isCronPaused } from '../src/lib/services/cron-run'

let bad = 0
const ok = (c: boolean, label: string) => { if (!c) bad++; console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`) }
ok(!isCronPaused('invoice-reminders', undefined), 'ikke sat → kører')
ok(!isCronPaused('invoice-reminders', ''), 'tom → kører')
ok(isCronPaused('invoice-reminders', 'invoice-reminders'), 'navngivet → pauset')
ok(isCronPaused('offer-reminders', 'invoice-reminders, offer-reminders'), 'liste med mellemrum → pauset')
ok(!isCronPaused('email-sync', 'invoice-reminders,offer-reminders'), 'ikke på listen → kører')
ok(isCronPaused('email-sync', '*'), '* → alle pauset')
ok(isCronPaused('Invoice-Reminders', 'invoice-reminders'), 'versaler ligegyldige')
ok(!isCronPaused('invoice', 'invoice-reminders'), 'ingen delvis match')
console.log(bad ? `\n❌ ${bad} fejl` : '\n✅ alle cron-paused-tests bestået')
process.exitCode = bad ? 1 : 0
