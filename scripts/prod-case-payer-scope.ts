/**
 * PRODUCTION read-only: sager hvor betaler ≠ sagens kunde, og fakturaer på dem (adresseret til hvem). Kun antal.
 *   npx tsx scripts/prod-case-payer-scope.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'
withProdReadOnly('prod-case-payer-scope', async (run, masked) => {
  const rows = await run(`SELECT
      (SELECT count(*) FROM service_cases) cases,
      (SELECT count(*) FROM service_cases WHERE payer_customer_id IS NOT NULL AND payer_customer_id <> customer_id) payer_differs,
      (SELECT count(*) FROM invoices i JOIN service_cases s ON s.id = i.case_id WHERE s.payer_customer_id IS NOT NULL AND s.payer_customer_id <> s.customer_id) invoices_on_those,
      (SELECT count(*) FROM invoices i JOIN service_cases s ON s.id = i.case_id WHERE s.payer_customer_id IS NOT NULL AND s.payer_customer_id <> s.customer_id AND i.customer_id = s.payer_customer_id) invoices_to_payer,
      (SELECT count(*) FROM offers WHERE payer_customer_id IS NOT NULL AND payer_customer_id <> customer_id) offers_payer_differs`)
  console.log(`--- betaler ≠ kunde @ prod:${masked} ---`)
  console.log(JSON.stringify(rows[0]))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
