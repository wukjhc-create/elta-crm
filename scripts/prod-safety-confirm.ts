/**
 * PRODUCTION read-only sikkerhedsbekraeftelse efter prod-migrationer: ingen kundemail, ingen finance-skrivning,
 * cron-adfaerd synlig (kun antal/status — ingen id'er, adresser eller beloeb pr. kunde).
 *   npx tsx scripts/prod-safety-confirm.ts [timer=24]
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

const hours = Math.max(1, Math.min(168, Number(process.argv[2] ?? 24)))

withProdReadOnly('prod-safety-confirm', async (run, masked) => {
  const since = `now() - interval '${hours} hours'`
  const q = async (label: string, sql: string) => console.log(`  ${label}: ${JSON.stringify(await run(sql))}`)
  console.log(`--- sikkerhedsbekræftelse @ prod:${masked} · seneste ${hours} t ---`)
  await q('tilbudsrykkere sendt', `SELECT count(*)::int n FROM offers WHERE last_reminder_sent > ${since}`)
  await q('fakturarykkere pr. status', `SELECT status, count(*)::int n FROM invoice_reminder_log WHERE created_at > ${since} GROUP BY 1 ORDER BY 1`)
  await q('agent send_reply udført', `SELECT count(*)::int n FROM agent_actions WHERE capability = 'mail.send_reply' AND executed_at > ${since}`)
  await q('leverandørfakturaer bogført (e-conomic)', `SELECT count(*)::int n FROM incoming_invoices WHERE posted_at > ${since}`)
  await q('udgående fakturaer oprettet', `SELECT count(*)::int n FROM invoices WHERE created_at > ${since}`)
  await q('cron-kørsler pr. cron/status', `SELECT metadata->>'cron' AS cron, status, count(*)::int n FROM system_health_log WHERE service = 'cron' AND created_at > ${since} GROUP BY 1,2 ORDER BY 1,2`)
  await q('agent_configs', `SELECT count(*)::int configs, count(*) FILTER (WHERE enabled)::int enabled, count(*) FILTER (WHERE safety_mode <> 'suggest')::int ikke_suggest FROM agent_configs`)
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
