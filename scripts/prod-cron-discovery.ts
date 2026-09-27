/**
 * P1 #9 discovery — READ-ONLY mod prod: hvad goer de planlagte crons faktisk? (ingen aendringer, ingen aktivering)
 * Koer: npx tsx scripts/prod-cron-discovery.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

const QUERIES: Array<[string, string]> = [
  ['offer-reminders: reminder_enabled (company_settings)', `SELECT reminder_enabled, reminder_interval_days, reminder_max_count FROM company_settings LIMIT 1`],
  ['offer-reminders: tilbud med rykker sendt, 30 dage', `SELECT count(*)::int n, max(last_reminder_sent) seneste FROM offers WHERE last_reminder_sent > now() - interval '30 days'`],
  ['invoice-reminders: rykker-log 30 dage pr. status', `SELECT status, level, count(*)::int n, max(created_at) seneste FROM invoice_reminder_log WHERE created_at > now() - interval '30 days' GROUP BY 1,2 ORDER BY 1,2`],
  ['invoice-reminders: rykker-log i alt', `SELECT count(*)::int n, max(created_at) seneste FROM invoice_reminder_log`],
  ['supplier-sync: planer', `SELECT count(*)::int planer, count(*) FILTER (WHERE is_enabled)::int aktive, max(last_run_at) seneste_koersel FROM supplier_sync_schedules`],
  ['supplier-sync/lemu: sync-logs seneste 60 dage', `SELECT job_type, status, count(*)::int n, max(created_at) seneste FROM supplier_sync_logs WHERE created_at > now() - interval '60 days' GROUP BY 1,2 ORDER BY 1,2`],
  ['email-sync: graph_sync_state', `SELECT last_sync_at, last_sync_status, left(coalesce(last_sync_error,''),80) fejl FROM graph_sync_state`],
  ['system_health_log: 7 dage pr. service/status', `SELECT service, status, count(*)::int n, max(created_at) seneste FROM system_health_log WHERE created_at > now() - interval '7 days' GROUP BY 1,2 ORDER BY 1,2`],
  ['invoice-reminders: aarsager (skipped)', `SELECT left(coalesce(reason,''),90) aarsag, count(*)::int n FROM invoice_reminder_log GROUP BY 1 ORDER BY 2 DESC LIMIT 5`],
  ['system_health_log: seneste warnings pr. service', `SELECT DISTINCT ON (service) service, left(message,110) besked FROM system_health_log WHERE status <> 'ok' AND created_at > now() - interval '2 days' ORDER BY service, created_at DESC`],
  ['unanswered-mails-check: auto-opgaver 30 dage', `SELECT count(*)::int n FROM customer_tasks WHERE created_at > now() - interval '30 days' AND title ILIKE '%ubesvar%'`],
]

withProdReadOnly('prod-cron-discovery', async (run, masked) => {
  console.log(`PROD CRON-DISCOVERY (read-only) ${masked}`)
  for (const [label, sql] of QUERIES) {
    try {
      const rows = await run(sql)
      console.log(`\n${label}:`)
      for (const r of rows) console.log('  ' + JSON.stringify(r))
      if (!rows.length) console.log('  (ingen rækker)')
    } catch (e) {
      console.log(`\n${label}: FEJL ${maskDbError(e)}`)
    }
  }
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
