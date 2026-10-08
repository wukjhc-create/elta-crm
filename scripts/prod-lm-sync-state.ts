/**
 * PRODUCTION read-only: tilstanden af Lemvigh-Müller-kataloget efter de ugentlige FTP-synk (lemu-sync). Kun antal.
 *   npx tsx scripts/prod-lm-sync-state.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-lm-sync-state', async (run) => {
  const sup = await run(`SELECT id, name FROM suppliers WHERE name ILIKE '%lemvigh%' OR code ILIKE 'LM%' OR name ILIKE '%lemu%'`)
  for (const s of sup) {
    const [c] = await run(`
      SELECT count(*)::int total,
             count(*) FILTER (WHERE status = 'pending')::int status_pending,
             count(*) FILTER (WHERE status = 'active')::int status_active,
             count(*) FILTER (WHERE data_source = 'import')::int src_import,
             count(*) FILTER (WHERE cost_price = 0)::int kost_0,
             count(*) FILTER (WHERE cost_price IS NULL)::int kost_null,
             count(*) FILTER (WHERE category = 'Lemu Import')::int kat_lemu_import,
             count(*) FILTER (WHERE last_synced_at > now() - interval '8 days')::int synk_8d,
             max(last_synced_at)::text AS seneste_synk
        FROM supplier_products WHERE supplier_id = $1`.replace('$1', `'${s.id}'`))
    console.log(`${s.name}: ${JSON.stringify(c)}`)
    const [h] = await run(`SELECT count(*)::int n, count(*) FILTER (WHERE ph.created_at > now() - interval '30 days')::int n30, count(DISTINCT supplier_product_id)::int produkter
                             FROM price_history ph JOIN supplier_products sp ON sp.id = ph.supplier_product_id WHERE sp.supplier_id = '${s.id}' AND ph.change_source = 'ftp_sync'`)
    console.log(`  price_history ftp_sync: ${JSON.stringify(h)}`)
    const logs = await run(`SELECT status, count(*)::int n, max(created_at)::text seneste FROM supplier_sync_logs WHERE supplier_id = '${s.id}' GROUP BY status`)
    console.log(`  sync-logs: ${JSON.stringify(logs)}`)
  }
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
