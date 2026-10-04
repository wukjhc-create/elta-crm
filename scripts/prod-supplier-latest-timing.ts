/**
 * PRODUCTION read-only: tid for "seneste prisopdatering" pr. leverandør (top-1) — bruges af Go-live-tjeklisten.
 *   npx tsx scripts/prod-supplier-latest-timing.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-supplier-latest-timing', async (run) => {
  const sups = (await run(`SELECT id, code FROM suppliers WHERE is_active`)) as Array<{ id: string; code: string }>
  for (const s of sups) {
    const t0 = Date.now()
    const r = await run(`SELECT 1 AS ok FROM supplier_products WHERE supplier_id = '${s.id}' AND updated_at > now() - interval '60 days' LIMIT 1`)
    console.log(`${s.code}: ${Date.now() - t0} ms · frisk=${r.length > 0}`)
  }
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
