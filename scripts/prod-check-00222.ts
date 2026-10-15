/**
 * PRODUCTION read-only: før/efter-tjek for 00222 (PE-1/PE-2).  npx tsx scripts/prod-check-00222.ts
 * Arbejdsordrernes beregnede avance (calculate_work_order_profit er en ren SELECT-funktion) + checksums på de tabeller
 * der aldrig må omskrives (fakturaer, timer, materialer, øvrige omkostninger) + snapshot-/flag-antal.
 */
import { withProdReadOnly, maskDbError } from './prod-readonly'
withProdReadOnly('prod-check-00222', async (run) => {
  const wos = (await run(`SELECT id, status, low_profit FROM work_orders ORDER BY id`)) as Array<{ id: string; status: string; low_profit: boolean }>
  for (const [i, w] of wos.entries()) {
    const r = (await run(`SELECT public.calculate_work_order_profit('${w.id}'::uuid) AS p`)) as Array<{ p: Record<string, unknown> }>
    const p = r[0]?.p ?? {}
    console.log(`WO#${i + 1} status=${w.status} low_profit=${w.low_profit} · revenue=${p.revenue} labor=${p.labor_cost} material=${p.material_cost} other=${p.other_cost ?? '(ingen nøgle)'} total=${p.total_cost} margin=${p.margin_percentage} kilde=${p.revenue_source}`)
  }
  const ck = async (label: string, sql: string) => { const x = (await run(sql)) as Array<{ n: number; h: string }>; console.log(`${label}: n=${x[0]?.n} md5=${x[0]?.h}`) }
  await ck('invoices', `SELECT count(*)::int n, md5(string_agg(id::text||'|'||status||'|'||coalesce(total_amount::text,'')||'|'||coalesce(voided_at::text,''), ',' ORDER BY id)) h FROM invoices`)
  await ck('time_logs', `SELECT count(*)::int n, md5(string_agg(id::text||'|'||coalesce(cost_amount::text,'')||'|'||coalesce(sale_amount::text,'')||'|'||approval_status||'|'||coalesce(end_time::text,''), ',' ORDER BY id)) h FROM time_logs`)
  await ck('case_materials', `SELECT count(*)::int n, md5(string_agg(id::text||'|'||coalesce(total_cost::text,'')||'|'||coalesce(total_sales_price::text,''), ',' ORDER BY id)) h FROM case_materials`)
  await ck('case_other_costs', `SELECT count(*)::int n, md5(string_agg(id::text||'|'||coalesce(total_cost::text,'')||'|'||coalesce(total_sales_price::text,''), ',' ORDER BY id)) h FROM case_other_costs`)
  const s = (await run(`SELECT (SELECT count(*) FROM work_order_profit)::int snaps, (SELECT count(*) FROM work_orders WHERE low_profit)::int low`)) as Array<Record<string, number>>
  console.log(`snapshots=${s[0]?.snaps} low_profit=${s[0]?.low}`)
  const trg = (await run(`SELECT string_agg(tgname, ',' ORDER BY tgname) t FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE '%snapshot_profit%'`)) as Array<{ t: string }>
  console.log(`triggere: ${trg[0]?.t}`)
}).catch((e) => { console.error(maskDbError(e)); process.exitCode = 1 })
