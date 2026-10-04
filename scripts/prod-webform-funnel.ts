/**
 * PRODUCTION read-only: webhenvendelser (hjemmesidens kontaktformular via formsubmit) → kunde → tilbud/sag. Kun antal.
 *   npx tsx scripts/prod-webform-funnel.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

const WF = `FROM incoming_emails e WHERE e.sender_email ILIKE '%@formsubmit.co' AND e.subject ILIKE '%henvendelse%'`

withProdReadOnly('prod-webform-funnel', async (run) => {
  const row = (await run(`SELECT json_build_object(
    'webhenvendelser', (SELECT count(*)::int ${WF}),
    'seneste_90d', (SELECT count(*)::int ${WF} AND e.received_at > now() - interval '90 days'),
    'uden_kunde', (SELECT count(*)::int ${WF} AND e.customer_id IS NULL),
    'uden_kunde_ikke_ignoreret', (SELECT count(*)::int ${WF} AND e.customer_id IS NULL AND e.link_status <> 'ignored'),
    'med_kunde', (SELECT count(*)::int ${WF} AND e.customer_id IS NOT NULL),
    'kunde_med_tilbud', (SELECT count(*)::int ${WF} AND EXISTS (SELECT 1 FROM offers o WHERE o.customer_id = e.customer_id)),
    'kunde_med_sag', (SELECT count(*)::int ${WF} AND EXISTS (SELECT 1 FROM service_cases s WHERE s.customer_id = e.customer_id)),
    'ulaeste', (SELECT count(*)::int ${WF} AND NOT e.is_read),
    'aeldste_uden_kunde_dage', (SELECT extract(day FROM now() - min(e.received_at))::int ${WF} AND e.customer_id IS NULL AND e.link_status <> 'ignored'),
    'leads_total', (SELECT count(*)::int FROM leads),
    'leads_90d', (SELECT count(*)::int FROM leads WHERE created_at > now() - interval '90 days')
  ) r`))[0].r
  console.log(JSON.stringify(row, null, 2))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
