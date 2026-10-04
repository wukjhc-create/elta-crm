/**
 * PRODUCTION read-only: hvor friske er leverandørpriserne (N57)? Pr. leverandør: antal varer, seneste prisopdatering,
 * seneste import. Kun aggregater.
 *   npx tsx scripts/prod-supplier-freshness.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-supplier-freshness', async (run) => {
  const rows = await run(`SELECT s.code, s.is_active,
      (SELECT count(*)::int FROM supplier_products p WHERE p.supplier_id = s.id) AS varer,
      (SELECT max(p.updated_at)::date FROM supplier_products p WHERE p.supplier_id = s.id) AS senest_opdateret,
      (SELECT max(b.created_at)::date FROM import_batches b WHERE b.supplier_id = s.id) AS seneste_import
    FROM suppliers s WHERE s.is_active ORDER BY 3 DESC LIMIT 15`)
  console.log(JSON.stringify(rows, null, 2))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
