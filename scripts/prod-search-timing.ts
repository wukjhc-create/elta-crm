/** PRODUCTION read-only: svartid for produktsøgning (samme mønster som searchSupplierProducts). N4. */
import { withProdReadOnly, maskDbError } from './prod-readonly'
const terms = process.argv.slice(2).length ? process.argv.slice(2) : ['kabel', 'stikkontakt', '5701234', 'zzqxw', 'NYM-J 3x1,5']
withProdReadOnly('prod-search-timing', async (run) => {
  console.log(JSON.stringify((await run(`SELECT count(*)::int n FROM supplier_products`))[0]))
  for (const t of terms) {
    const safe = t.replace(/[%_'\\]/g, '')
    const t0 = Date.now()
    const rows = await run(`SELECT id FROM supplier_products WHERE is_available = true AND (supplier_sku ILIKE '%${safe}%' OR supplier_name ILIKE '%${safe}%' OR ean ILIKE '%${safe}%') LIMIT 20`)
    console.log(`${t.padEnd(14)} ${String(rows.length).padStart(3)} hits  ${Date.now() - t0} ms`)
  }
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
