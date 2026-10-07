/**
 * PRODUCTION read-only: hvor mange leverandørvarenumre/EAN har små bogstaver eller mellemrum (fakturakontrollen slår op
 * med normaliserede koder = STORE bogstaver uden mellemrum). Kun antal pr. leverandør — ingen varenumre ud.
 *   npx tsx scripts/prod-sku-case.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-sku-case', async (run, masked) => {
  const rows = await run(`SELECT s.name supplier,
      count(*)::int total,
      count(*) FILTER (WHERE p.supplier_sku <> upper(p.supplier_sku))::int sku_lower,
      count(*) FILTER (WHERE p.supplier_sku ~ '\\s')::int sku_space,
      count(*) FILTER (WHERE p.ean IS NOT NULL AND p.ean ~ '\\s')::int ean_space
    FROM supplier_products p JOIN suppliers s ON s.id = p.supplier_id GROUP BY s.name ORDER BY s.name`)
  console.log(`--- varenummer-normalisering @ prod:${masked} ---`)
  console.table(rows)
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
