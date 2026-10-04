/**
 * PRODUCTION read-only: leads — status, kilde, alder, koblet til kunde/tilbud. Kun antal.
 *   npx tsx scripts/prod-leads-state.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-leads-state', async (run) => {
  const row = (await run(`SELECT json_build_object(
    'status', (SELECT json_object_agg(status, n) FROM (SELECT status::text, count(*)::int n FROM leads GROUP BY 1) x),
    'kilde', (SELECT json_object_agg(source, n) FROM (SELECT source::text, count(*)::int n FROM leads GROUP BY 1) x),
    'aabne_aeldre_end_7d', (SELECT count(*)::int FROM leads WHERE status::text IN ('new', 'contacted') AND created_at < now() - interval '7 days'),
    'med_kunde', (SELECT count(*)::int FROM leads WHERE custom_fields ? 'customer_id'),
    'seneste', (SELECT max(created_at)::date FROM leads)
  ) r`))[0].r
  console.log(JSON.stringify(row, null, 2))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
