/** PRODUCTION read-only (leverandør-review): bruges API-sync/credentials/kundeaftaler? Kun antal. */
import { withProdReadOnly, maskDbError } from './prod-readonly'
withProdReadOnly('prod-supplier-api-usage', async (run) => {
  console.log(JSON.stringify((await run(`SELECT json_build_object(
    'credentials', (SELECT count(*)::int FROM supplier_credentials),
    'credentials_aktive', (SELECT count(*)::int FROM supplier_credentials WHERE coalesce(is_active, true)),
    'cache_rows', (SELECT count(*)::int FROM supplier_product_cache),
    'cache_kost_0', (SELECT count(*)::int FROM supplier_product_cache WHERE coalesce(cached_cost_price, 0) = 0),
    'produkter', (SELECT count(*)::int FROM supplier_products),
    'produkter_kost_0_eller_null', (SELECT count(*)::int FROM supplier_products WHERE coalesce(cost_price, 0) = 0),
    'kundeaftaler', (SELECT count(*)::int FROM customer_supplier_prices),
    'kundepriser', (SELECT count(*)::int FROM customer_product_prices),
    'synk_planer_aktive', (SELECT count(*)::int FROM supplier_sync_schedules WHERE coalesce(is_enabled, false))
  ) r`))[0].r))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
