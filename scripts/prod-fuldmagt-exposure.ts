/**
 * PRODUCTION read-only: S1-fuldmagt-læk (portal-review 2026-10-07) — hvor mange fuldmagter kunne ses af en ANDEN kunde
 * end den tiltænkte underskriver, og blev de berørte portal-links overhovedet åbnet? Kun antal — ingen navne/CPR.
 *   npx tsx scripts/prod-fuldmagt-exposure.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-fuldmagt-exposure', async (run, masked) => {
  const rows = await run(`SELECT
      count(*)::int fuldmagter,
      count(*) FILTER (WHERE d.description::jsonb->>'status' = 'signed')::int signed,
      count(*) FILTER (WHERE sc.id IS NOT NULL AND coalesce(sc.end_customer_id, sc.site_customer_id, sc.customer_id) <> d.customer_id)::int on_other_card,
      count(*) FILTER (WHERE sc.id IS NOT NULL AND coalesce(sc.end_customer_id, sc.site_customer_id, sc.customer_id) <> d.customer_id
        AND d.description::jsonb->>'status' = 'signed')::int signed_on_other_card,
      count(*) FILTER (WHERE sc.id IS NOT NULL AND coalesce(sc.end_customer_id, sc.site_customer_id, sc.customer_id) <> d.customer_id
        AND d.description::jsonb->>'status' = 'signed'
        AND EXISTS (SELECT 1 FROM portal_access_tokens t WHERE t.customer_id = d.customer_id AND t.last_accessed_at IS NOT NULL
          AND t.last_accessed_at > (d.description::jsonb->>'signed_at')::timestamptz))::int signed_other_card_portal_opened_after,
      count(*) FILTER (WHERE sc.end_customer_id IS NOT NULL AND sc.site_customer_id IS NOT NULL
        AND sc.site_customer_id <> sc.end_customer_id)::int case_with_separate_site_customer
    FROM customer_documents d LEFT JOIN service_cases sc ON sc.id = d.service_case_id
    WHERE d.document_type = 'contract' AND d.description IS NOT NULL AND d.description LIKE '{%' AND d.description::jsonb->>'type' = 'fuldmagt'`)
  console.log(`--- fuldmagt-eksponering @ prod:${masked} ---`)
  console.table(rows)
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
