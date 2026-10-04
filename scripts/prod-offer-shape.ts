/**
 * PRODUCTION read-only: hvordan ser tilbuddene ud — linjer pr. tilbud, beløb uden linjer, status, oprettelsesmåned,
 * forslag (is_proposal), skabelon/pakke. Afgør hvorfor tilbudsmodulet næsten ikke bruges. Kun antal.
 *   npx tsx scripts/prod-offer-shape.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-offer-shape', async (run) => {
  const row = (await run(`SELECT json_build_object(
    'tilbud', (SELECT count(*)::int FROM offers),
    'forslag', (SELECT count(*)::int FROM offers WHERE is_proposal),
    'status', (SELECT json_object_agg(status, n) FROM (SELECT status, count(*)::int n FROM offers GROUP BY 1) x),
    'linjer_pr_tilbud', (SELECT json_object_agg(k, n) FROM (SELECT CASE WHEN c = 0 THEN '0' WHEN c = 1 THEN '1' WHEN c <= 5 THEN '2-5' ELSE '6+' END k, count(*)::int n
        FROM (SELECT o.id, (SELECT count(*) FROM offer_line_items l WHERE l.offer_id = o.id) c FROM offers o) y GROUP BY 1) x),
    'beloeb_uden_linjer', (SELECT count(*)::int FROM offers o WHERE coalesce(o.final_amount, 0) > 0 AND NOT EXISTS (SELECT 1 FROM offer_line_items l WHERE l.offer_id = o.id)),
    'pr_maaned', (SELECT json_object_agg(m, n) FROM (SELECT to_char(created_at, 'YYYY-MM') m, count(*)::int n FROM offers GROUP BY 1 ORDER BY 1) x),
    'med_dokument', (SELECT count(DISTINCT o.id)::int FROM offers o JOIN customer_documents d ON d.customer_id = o.customer_id AND d.document_type ILIKE '%offer%'),
    'kalkulationer', (SELECT count(*)::int FROM calculations),
    'sager_med_tilbud', (SELECT count(*)::int FROM service_cases WHERE source_offer_id IS NOT NULL)
  ) r`))[0].r
  console.log(JSON.stringify(row, null, 2))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
