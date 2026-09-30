/**
 * PRODUCTION read-only: tegn paa udnyttelse af P-010/P-011? Kun antal.
 *   npx tsx scripts/prod-p010-p011-evidence.ts
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'

withProdReadOnly('prod-p010-p011-evidence', async (run, masked) => {
  console.log(`--- P-010/P-011 evidens @ prod:${masked} ---`)
  const cols = (await run(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='bank_transactions'`)) as Array<{ column_name: string }>
  console.log('  bank_transactions-kolonner:', cols.map((c) => c.column_name).join(', '))
  console.log('  bank_transactions:', JSON.stringify((await run(`SELECT count(*)::int n, min(created_at)::date::text foerste, max(created_at)::date::text seneste FROM bank_transactions`))[0]))
  const pcols = (await run(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='invoice_payments'`)) as Array<{ column_name: string }>
  console.log('  invoice_payments-kolonner:', pcols.map((c) => c.column_name).join(', '))
  console.log('  invoice_payments:', JSON.stringify((await run(`SELECT count(*)::int n FROM invoice_payments`))[0]))
  console.log('  fakturaer status:', JSON.stringify(await run(`SELECT status, count(*)::int n FROM invoices GROUP BY 1 ORDER BY 1`)))
  console.log('  outbound-vedhæftninger i kundedokumenter:', JSON.stringify((await run(`SELECT count(*)::int n FROM customer_documents WHERE storage_path LIKE 'outbound-attachments/%'`))[0]))
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
