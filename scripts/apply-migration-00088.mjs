import fs from 'fs';
const env = {};
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const t = l.trim(); if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('='); if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}
const ref = env.NEXT_PUBLIC_SUPABASE_URL.replace('https://', '').split('.')[0];
async function q(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  return { status: r.status, text: await r.text() };
}

const sql = fs.readFileSync('supabase/migrations/00088_payroll_and_profitability.sql', 'utf8');
const r = await q(sql);
console.log('apply:', r.status, r.text.substring(0, 600) || '(empty)');

await q("NOTIFY pgrst, 'reload schema';");

const v = await q(`
  SELECT
    (SELECT column_name FROM information_schema.columns WHERE table_name='employees'  AND column_name='cost_rate') AS emp_cost_rate,
    (SELECT column_name FROM information_schema.columns WHERE table_name='time_logs'  AND column_name='cost_amount') AS tl_cost,
    (SELECT to_regclass('public.work_order_profit')::text) AS profit_table,
    (SELECT pg_get_function_result(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='calculate_work_order_profit') AS calc_returns,
    (SELECT pg_get_function_result(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='snapshot_work_order_profit') AS snap_returns,
    (SELECT tgname FROM pg_trigger WHERE tgname='trg_invoices_snapshot_profit') AS trg_inv,
    (SELECT tgname FROM pg_trigger WHERE tgname='trg_work_orders_done_snapshot') AS trg_wo,
    (SELECT tgname FROM pg_trigger WHERE tgname='trg_time_logs_cost_amount') AS trg_cost;
`);
console.log('verify:', v.text);
