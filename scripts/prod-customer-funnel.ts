/**
 * PRODUCTION read-only: salgstragt for nye kunder (N44). Hvor kommer kunderne fra, og når de videre til tilbud/sag/
 * faktura? Kun aggregater (ingen persondata).
 *   npx tsx scripts/prod-customer-funnel.ts [dage=90]
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

const days = Math.max(1, Math.min(365, Number(process.argv[2] ?? 90) || 90))

withProdReadOnly('prod-customer-funnel', async (run) => {
  const row = (await run(`SELECT json_build_object(
    'nye_kunder', (SELECT count(*)::int FROM customers WHERE created_at > now() - interval '${days} days'),
    'kilder', (SELECT json_agg(json_build_object('kilde', k, 'n', n)) FROM (
        SELECT coalesce(custom_fields->>'source', custom_fields->>'created_from', CASE WHEN created_by IS NULL THEN 'system/ukendt' ELSE 'manuel' END) k, count(*)::int n
        FROM customers WHERE created_at > now() - interval '${days} days' GROUP BY 1 ORDER BY 2 DESC) x),
    'med_tilbud', (SELECT count(DISTINCT c.id)::int FROM customers c JOIN offers o ON o.customer_id = c.id WHERE c.created_at > now() - interval '${days} days'),
    'med_sag', (SELECT count(DISTINCT c.id)::int FROM customers c JOIN service_cases s ON s.customer_id = c.id WHERE c.created_at > now() - interval '${days} days'),
    'med_mail', (SELECT count(DISTINCT c.id)::int FROM customers c JOIN incoming_emails m ON m.customer_id = c.id WHERE c.created_at > now() - interval '${days} days'),
    'med_portal', (SELECT count(DISTINCT c.id)::int FROM customers c JOIN portal_access_tokens t ON t.customer_id = c.id WHERE c.created_at > now() - interval '${days} days'),
    'tilbud_status', (SELECT json_object_agg(status, n) FROM (SELECT status, count(*)::int n FROM offers GROUP BY 1) y),
    'seneste_tilbud', (SELECT max(created_at)::date FROM offers),
    'leads_status', (SELECT json_object_agg(status, n) FROM (SELECT status, count(*)::int n FROM leads GROUP BY 1) z),
    'mails_med_kunde_30d', (SELECT count(*)::int FROM incoming_emails WHERE received_at > now() - interval '30 days' AND customer_id IS NOT NULL),
    'mails_30d', (SELECT count(*)::int FROM incoming_emails WHERE received_at > now() - interval '30 days')
  ) r`))[0].r
  console.log(JSON.stringify(row, null, 2))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
