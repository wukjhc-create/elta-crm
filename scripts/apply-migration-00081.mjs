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

const sql = fs.readFileSync('supabase/migrations/00081_invoice_reminders.sql', 'utf8');
const r = await q(sql);
console.log('apply:', r.status, r.text.substring(0, 500) || '(empty)');

const reload = await q("NOTIFY pgrst, 'reload schema';");
console.log('reload:', reload.status);

const verify = await q(`
  SELECT
    column_name
    FROM information_schema.columns
   WHERE table_name='invoices'
     AND column_name IN ('payment_reference','reminder_count','last_reminder_at','sent_at','paid_at')
   ORDER BY column_name;
`);
console.log('cols:', verify.text);

const log = await q(`SELECT to_regclass('public.invoice_reminder_log')::text AS t;`);
console.log('log table:', log.text);
