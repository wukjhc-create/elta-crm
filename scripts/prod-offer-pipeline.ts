/**
 * PRODUCTION read-only: tilbudspipeline (N51) — accepterede tilbud uden sag/faktura, kladder der aldrig blev sendt,
 * sendte uden svar. Kun aggregater.
 *   npx tsx scripts/prod-offer-pipeline.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-offer-pipeline', async (run) => {
  const row = (await run(`SELECT json_build_object(
    'accepteret', (SELECT count(*)::int FROM offers WHERE status = 'accepted'),
    'accepteret_uden_sag', (SELECT count(*)::int FROM offers o WHERE o.status = 'accepted'
        AND NOT EXISTS (SELECT 1 FROM service_cases s WHERE s.source_offer_id = o.id)),
    'accepteret_uden_faktura', (SELECT count(*)::int FROM offers o WHERE o.status = 'accepted'
        AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.offer_id = o.id)
        AND NOT EXISTS (SELECT 1 FROM service_cases s JOIN invoices i ON i.case_id = s.id WHERE s.source_offer_id = o.id)),
    'kladder_aeldre_14d', (SELECT count(*)::int FROM offers WHERE status = 'draft' AND created_at < now() - interval '14 days'),
    'sendt_uden_svar_14d', (SELECT count(*)::int FROM offers WHERE status IN ('sent', 'viewed') AND coalesce(sent_at, created_at) < now() - interval '14 days'),
    'accepteret_vaerdi', (SELECT coalesce(round(sum(final_amount)), 0) FROM offers WHERE status = 'accepted')
  ) r`))[0].r
  console.log(JSON.stringify(row, null, 2))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
