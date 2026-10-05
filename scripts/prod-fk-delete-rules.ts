/** PRODUCTION read-only: ON DELETE-regler for udvalgte FK'er (sags-/kunde-review). Kun metadata. */
import { withProdReadOnly, maskDbError } from './prod-readonly'
withProdReadOnly('prod-fk-delete-rules', async (run) => {
  const rows = await run(`SELECT conrelid::regclass::text AS tabel, a.attname AS kolonne, confrelid::regclass::text AS til,
      CASE confdeltype WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'r' THEN 'RESTRICT' WHEN 'a' THEN 'NO ACTION' ELSE confdeltype::text END AS ved_sletning
    FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f' AND ((conrelid::regclass::text IN ('customers','leads') AND a.attname = 'created_by')
      OR (conrelid::regclass::text IN ('offers','invoices','service_cases','offer_signatures') AND a.attname IN ('customer_id','offer_id')))
    ORDER BY 1, 2`)
  for (const r of rows) console.log(`${r.tabel}.${r.kolonne} → ${r.til}: ${r.ved_sletning}`)
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
