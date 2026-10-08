/**
 * PRODUCTION read-only: omfang af 00206 — aktive kundeaftaler (customer_supplier_prices) uden egen avance (rabat ignoreres
 * af get_customer_product_price før 00206) + kundeproduktpriser. Kun antal, ingen værdier.
 *   npx tsx scripts/prod-customer-price-agreements.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-customer-price-agreements', async (run, masked) => {
  const rows = await run(`SELECT
      (SELECT count(*) FROM customer_supplier_prices WHERE is_active) aktive_aftaler,
      (SELECT count(*) FROM customer_supplier_prices WHERE is_active AND custom_margin_percentage IS NULL AND COALESCE(discount_percentage, 0) > 0) rabat_uden_avance,
      (SELECT count(*) FROM customer_product_prices WHERE is_active) kundeproduktpriser`)
  console.log(`--- kundeaftaler @ prod:${masked} ---`)
  console.log(JSON.stringify(rows[0]))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
