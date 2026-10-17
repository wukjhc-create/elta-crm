/**
 * PRODUCTION read-only (CR-2, cron-review 2026-10-17): sendes betalingsrykkere faktisk i dag? Status i
 * invoice_reminder_log seneste 30 dage, invoice_overdue-regler (aktiv/dry_run) og antal forfaldne udstedte fakturaer.
 * Kun aggregater, ingen personværdier.
 *   npx tsx scripts/prod-reminder-status.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'
withProdReadOnly('prod-reminder-status', async (run, masked) => {
  const safe = async (sql: string) => run(sql).catch((e) => [{ error: maskDbError(e) }]) as Promise<Array<Record<string, unknown>>>
  const log = await safe(`SELECT status, count(*)::int n, max(created_at)::text last FROM public.invoice_reminder_log
      WHERE created_at > now() - interval '30 days' GROUP BY 1 ORDER BY 1`)
  const logAll = await safe(`SELECT status, count(*)::int n, max(created_at)::text last FROM public.invoice_reminder_log GROUP BY 1 ORDER BY 1`)
  const rules = await safe(`SELECT trigger, action, active, dry_run FROM public.automation_rules
      WHERE trigger IN ('invoice_overdue') ORDER BY created_at`)
  const overdue = await safe(`SELECT count(*)::int n FROM public.invoices WHERE status = 'sent' AND voided_at IS NULL
      AND coalesce(invoice_type,'standard') <> 'credit_note' AND due_date < (now() AT TIME ZONE 'Europe/Copenhagen')::date`)
  const cron = await safe(`SELECT status, count(*)::int n, max(created_at)::text last FROM public.system_health_log
      WHERE service = 'cron' AND message LIKE 'invoice-reminders:%' AND created_at > now() - interval '14 days' GROUP BY 1 ORDER BY 1`)
  // årsag uden tal (dage/antal) — kun kategorien
  const reasons = await safe(`SELECT regexp_replace(coalesce(reason,'-'), '[0-9]+', 'N', 'g') r, count(*)::int n FROM public.invoice_reminder_log
      WHERE created_at > now() - interval '30 days' GROUP BY 1 ORDER BY 2 DESC LIMIT 8`)
  console.log(`prod:${masked}`)
  console.log(`årsager 30 d: ${JSON.stringify(reasons)}`)
  console.log(`rykker-log 30 d: ${JSON.stringify(log)}`)
  console.log(`rykker-log alt: ${JSON.stringify(logAll)}`)
  console.log(`invoice_overdue-regler: ${JSON.stringify(rules)}`)
  console.log(`forfaldne udstedte fakturaer: ${JSON.stringify(overdue)}`)
  console.log(`cron-kørsler 14 d: ${JSON.stringify(cron)}`)
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
