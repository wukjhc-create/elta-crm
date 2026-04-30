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

const sql = fs.readFileSync('supabase/migrations/00086_employees_workorders_timelogs.sql', 'utf8');
const r = await q(sql);
console.log('apply:', r.status, r.text.substring(0, 600) || '(empty)');

await q("NOTIFY pgrst, 'reload schema';");
const v = await q(`
  SELECT
    (SELECT to_regclass('public.employees')::text)   AS employees,
    (SELECT to_regclass('public.work_orders')::text) AS work_orders,
    (SELECT to_regclass('public.time_logs')::text)   AS time_logs,
    (SELECT indexname FROM pg_indexes WHERE indexname='uq_time_logs_one_active_per_employee') AS active_timer_index;
`);
console.log('verify:', v.text);
