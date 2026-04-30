/**
 * Verifies that every query the /api/dashboard/stats endpoint runs
 * returns successfully against the prod schema. Does NOT call the
 * endpoint over HTTP — the endpoint requires a logged-in user. We
 * replay each underlying query via the Management API instead.
 */
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
  const text = await r.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { ok: r.ok, status: r.status, body };
}

const tests = {
  new_emails_last_24h:        `SELECT COUNT(*)::int FROM incoming_emails WHERE received_at >= NOW() - INTERVAL '24 hours';`,
  new_customers_last_24h:     `SELECT COUNT(*)::int FROM customers WHERE created_at >= NOW() - INTERVAL '24 hours';`,
  open_cases:                 `SELECT COUNT(*)::int FROM service_cases WHERE status NOT IN ('closed','completed');`,
  offers_draft:               `SELECT COUNT(*)::int FROM offers WHERE status='draft';`,
  invoices_sent:              `SELECT COUNT(*)::int FROM invoices WHERE status='sent';`,
  invoices_overdue:           `SELECT COUNT(*)::int FROM invoices WHERE status='sent' AND payment_status<>'paid' AND due_date <= CURRENT_DATE;`,
  payments_today:             `SELECT COUNT(*)::int FROM invoice_payments WHERE recorded_at::date = CURRENT_DATE;`,
  system_errors_last_hour:    `SELECT COUNT(*)::int FROM system_health_log WHERE status='error' AND created_at >= NOW() - INTERVAL '1 hour';`,
  latest_emails:              `SELECT id, subject, sender_name, sender_email, received_at, customer_id FROM incoming_emails ORDER BY received_at DESC LIMIT 5;`,
  latest_invoices:            `SELECT id, invoice_number, final_amount, currency, status, payment_status, created_at FROM invoices ORDER BY created_at DESC LIMIT 5;`,
  overdue_invoices:           `SELECT id, invoice_number, final_amount, currency, due_date, customer_id FROM invoices WHERE status='sent' AND payment_status<>'paid' AND due_date <= CURRENT_DATE ORDER BY due_date LIMIT 5;`,
};

for (const [name, sql] of Object.entries(tests)) {
  const r = await q(sql);
  if (r.body && r.body.message) {
    console.error('FAIL', name, '→', r.body.message.split('\n')[0]);
  } else if (Array.isArray(r.body)) {
    if (typeof r.body[0]?.count === 'number' || typeof r.body[0]?.count === 'string') {
      console.log('OK  ', name, '→ count =', r.body[0].count);
    } else {
      console.log('OK  ', name, '→ rows =', r.body.length);
    }
  } else {
    console.log('?   ', name, r.body);
  }
}
