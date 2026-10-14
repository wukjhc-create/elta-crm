/** PRODUCTION read-only: profit-funktioner/-triggere + datamængder (PE-1/PE-2, 00222).  npx tsx scripts/prod-profit-fn-defs.ts [--defs] */
import { withProdReadOnly, maskDbError } from './prod-readonly'
const showDefs = process.argv.includes('--defs')
withProdReadOnly('prod-profit-fn-defs', async (run) => {
  const fns = (await run(`SELECT p.proname, p.prosecdef, pg_get_functiondef(p.oid) def FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname='public' AND p.proname IN ('calculate_work_order_profit','snapshot_work_order_profit','trg_invoice_snapshot_profit','trg_work_order_done_snapshot_profit','trg_profit_snapshot_flag_low') ORDER BY 1`)) as Array<{ proname: string; prosecdef: boolean; def: string }>
  for (const f of fns) console.log(`${f.proname}: security_definer=${f.prosecdef} · ${f.def.length} tegn${showDefs ? `\n${f.def}\n` : ''}`)
  const trg = (await run(`SELECT c.relname tbl, t.tgname, pg_get_triggerdef(t.oid) def FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE NOT t.tgisinternal AND t.tgname IN ('trg_invoices_snapshot_profit','trg_work_orders_done_snapshot','trg_work_order_profit_flag') ORDER BY 1`)) as Array<{ tbl: string; tgname: string; def: string }>
  for (const t of trg) console.log(`trigger ${t.tgname}: ${t.def.replace(/^CREATE TRIGGER \S+ /, '')}`)
  const cnt = (await run(`SELECT (SELECT count(*) FROM work_orders)::int wo, (SELECT count(*) FROM work_order_profit)::int snaps, (SELECT count(*) FROM work_orders WHERE source_offer_id IS NOT NULL)::int wo_offer, (SELECT count(*) FROM case_materials WHERE work_order_id IS NOT NULL)::int mat_wo, (SELECT count(*) FROM case_materials)::int mat, (SELECT count(*) FROM invoices WHERE work_order_id IS NOT NULL)::int inv_wo, (SELECT count(*) FROM work_orders WHERE low_profit)::int low`)) as Array<Record<string, number>>
  console.log(`antal: ${JSON.stringify(cnt[0])}`)
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
