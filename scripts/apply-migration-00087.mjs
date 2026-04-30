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

const sql = fs.readFileSync('supabase/migrations/00087_invoice_from_work_order.sql', 'utf8');
const r = await q(sql);
console.log('apply:', r.status, r.text.substring(0, 600) || '(empty)');

await q("NOTIFY pgrst, 'reload schema';");

const verify = await q(`
  SELECT
    (SELECT column_name FROM information_schema.columns WHERE table_name='invoices' AND column_name='work_order_id') AS inv_col,
    (SELECT column_name FROM information_schema.columns WHERE table_name='employees' AND column_name='hourly_rate') AS emp_rate,
    (SELECT column_name FROM information_schema.columns WHERE table_name='work_orders' AND column_name='auto_invoice_on_done') AS auto_flag,
    (SELECT column_name FROM information_schema.columns WHERE table_name='work_orders' AND column_name='source_offer_id') AS offer_link,
    (SELECT pg_get_function_arguments(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='create_invoice_from_work_order') AS rpc_args;
`);
console.log('verify:', verify.text);
