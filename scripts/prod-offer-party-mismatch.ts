/**
 * PRODUCTION read-only: tilbud hvor parti-rollerne står på en ANDEN kunde end tilbuddets kunde (kundeskift på kladde,
 * tilbuds-review 2026-10-09 #1). Kun antal pr. status/billing_mode — ingen id'er/navne.
 *   npx tsx scripts/prod-offer-party-mismatch.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-offer-party-mismatch', async (run, masked) => {
  const rows = await run(`SELECT status, coalesce(billing_mode, '(null)') AS billing_mode,
      count(*) FILTER (WHERE orderer_customer_id IS DISTINCT FROM customer_id) AS orderer_diff,
      count(*) FILTER (WHERE end_customer_id IS DISTINCT FROM customer_id) AS end_diff,
      count(*) FILTER (WHERE payer_customer_id IS DISTINCT FROM customer_id) AS payer_diff,
      count(*) AS total
    FROM offers GROUP BY 1, 2 ORDER BY 1, 2`)
  console.log(`--- parti-roller vs. kunde @ prod:${masked} ---`)
  for (const r of rows) console.log(JSON.stringify(r))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
