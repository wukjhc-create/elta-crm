/**
 * Stage A preflight — PRODUCTION READ ONLY: mail-sync-sundhed og mail-tilstand (kun antal/tidspunkter, ingen indhold).
 *   npx tsx scripts/prod-stage-a-mail-health.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-stage-a-mail-health', async (run) => {
  const sync = await run(`SELECT mailbox, last_sync_status, (last_sync_error IS NOT NULL) has_error, last_sync_at::text, (delta_link IS NOT NULL) has_delta FROM graph_sync_state ORDER BY mailbox`)
  console.log('graph_sync_state:', JSON.stringify(sync.map((s) => ({ ...s, mailbox: String(s.mailbox).replace(/@.*/, '@…') }))))
  const cron = (await run(`SELECT
    (SELECT max(created_at)::text FROM system_health_log WHERE service = 'cron' AND coalesce(message,'') ILIKE '%email-sync%' AND status = 'ok') last_ok,
    (SELECT max(created_at)::text FROM system_health_log WHERE service = 'cron' AND coalesce(message,'') ILIKE '%email-sync%' AND status <> 'ok') last_fail,
    (SELECT count(*)::int FROM system_health_log WHERE service = 'cron' AND coalesce(message,'') ILIKE '%email-sync%' AND created_at > now() - interval '7 days') runs_7d,
    (SELECT count(*)::int FROM system_health_log WHERE service ILIKE '%mail%' AND status <> 'ok' AND created_at > now() - interval '7 days') mail_health_issues_7d,
    (SELECT max(created_at)::text FROM system_health_log WHERE service ILIKE '%mail%') last_mail_health`))[0]
  console.log('cron/health:', JSON.stringify(cron))
  const svc = await run(`SELECT service, status, count(*)::int n, max(created_at)::text last FROM system_health_log WHERE created_at > now() - interval '7 days' AND (service ILIKE '%mail%' OR coalesce(message,'') ILIKE '%mail%') GROUP BY 1,2 ORDER BY 1,2`)
  console.log('health (7d, mail):', JSON.stringify(svc))
  const own = `(sender_email ILIKE '%@eltasolar.dk')`
  const m = (await run(`SELECT
    (SELECT count(*)::int FROM incoming_emails) total,
    (SELECT count(*)::int FROM incoming_emails WHERE NOT ${own}) inbound,
    (SELECT count(*)::int FROM incoming_emails WHERE ${own}) own_or_sent,
    (SELECT max(received_at)::text FROM incoming_emails WHERE NOT ${own}) newest_inbound_received,
    (SELECT max(created_at)::text FROM incoming_emails WHERE NOT ${own}) newest_inbound_discovered,
    (SELECT count(*)::int FROM incoming_emails WHERE NOT ${own} AND created_at > now() - interval '24 hours') disc_24h,
    (SELECT count(*)::int FROM incoming_emails WHERE NOT ${own} AND created_at > now() - interval '3 days') disc_3d,
    (SELECT count(*)::int FROM incoming_emails WHERE NOT ${own} AND created_at > now() - interval '7 days') disc_7d,
    (SELECT count(*)::int FROM incoming_emails WHERE link_status::text = 'pending') pending_all,
    (SELECT count(*)::int FROM incoming_emails WHERE link_status::text = 'pending' AND processed_at IS NULL AND created_at > now() - interval '14 days') pending_retry_window,
    (SELECT count(*)::int FROM incoming_emails WHERE linked_by = 'manual' AND customer_id IS NOT NULL) manual,
    (SELECT count(*)::int FROM incoming_emails WHERE coalesce(linked_by,'') <> 'manual' AND customer_id IS NOT NULL) auto_linked,
    (SELECT count(*)::int FROM incoming_emails WHERE customer_id IS NULL AND NOT ${own}) unmatched_inbound,
    (SELECT count(*)::int FROM incoming_emails WHERE service_case_id IS NOT NULL) with_case,
    (SELECT count(*)::int FROM incoming_emails WHERE conversation_id IS NULL AND NOT ${own}) inbound_no_graph_thread,
    (SELECT count(*)::int FROM (SELECT graph_message_id FROM incoming_emails GROUP BY 1 HAVING count(*) > 1) d) dup_graph_ids,
    (SELECT count(*)::int FROM incoming_emails WHERE created_at - received_at > interval '2 days') discovered_gt_2d_late`))[0]
  console.log('mails:', JSON.stringify(m, null, 1))
  const ls = await run(`SELECT link_status::text s, count(*)::int n FROM incoming_emails GROUP BY 1 ORDER BY 1`)
  console.log('link_status:', JSON.stringify(ls))
  const lb = await run(`SELECT coalesce(linked_by,'(null)') b, count(*)::int n FROM incoming_emails GROUP BY 1 ORDER BY 1`)
  console.log('linked_by:', JSON.stringify(lb))
  // hvornår opdages mails? (time på dagen i UTC, sidste 30 dage) — viser den faktiske sync-kadence
  const hours = await run(`SELECT extract(hour FROM created_at)::int h, count(*)::int n FROM incoming_emails WHERE created_at > now() - interval '30 days' GROUP BY 1 ORDER BY 1`)
  console.log('opdaget pr. UTC-time (30d):', JSON.stringify(hours))
  const days = await run(`SELECT created_at::date::text d, count(*)::int n, count(DISTINCT date_trunc('minute', created_at))::int distinct_minutes FROM incoming_emails WHERE created_at > now() - interval '10 days' GROUP BY 1 ORDER BY 1`)
  console.log('opdaget pr. dag (10d) + distinkte minutter (≈ sync-kørsler):', JSON.stringify(days))
  const lag = (await run(`SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM created_at - received_at)/3600)::numeric(10,1) p50_h,
    percentile_cont(0.9) WITHIN GROUP (ORDER BY extract(epoch FROM created_at - received_at)/3600)::numeric(10,1) p90_h FROM incoming_emails WHERE created_at > now() - interval '30 days' AND NOT ${own}`))[0]
  console.log('opdagelses-forsinkelse (timer, 30d):', JSON.stringify(lag))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
