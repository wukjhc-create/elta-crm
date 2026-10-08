/** PRODUCTION read-only: SECURITY DEFINER/INVOKER for navngivne funktioner (00192-forberedelse). */
import { withProdReadOnly, maskDbError } from './prod-readonly'
const names = process.argv.slice(2).filter((n) => /^[a-z_0-9]+$/.test(n))
withProdReadOnly('prod-fn-security-list', async (run) => {
  const rows = await run(`SELECT p.proname AS navn, CASE WHEN p.prosecdef THEN 'DEFINER' ELSE 'invoker' END AS sikkerhed,
      (pg_get_functiondef(p.oid) ~* '(cost_price|cost_amount|cost_rate_snapshot|margin_percentage|supplier_cost_price_at_creation|supplier_margin_applied)') AS laeser_kost
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY(ARRAY[${names.map((n) => `'${n}'`).join(',')}]) ORDER BY 1`)
  for (const r of rows) console.log(`${r.navn}: ${r.sikkerhed}${r.laeser_kost ? ' · læser kostkolonner' : ''}`)
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
