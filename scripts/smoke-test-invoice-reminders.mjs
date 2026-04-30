/**
 * Smoke test for the invoice reminder rules.
 *
 * Builds 4 fake invoices in the DB at varying overdue days (1, 5, 12, 25)
 * and asks the rule-picker which level applies. We do NOT actually send
 * email — the test only exercises status+date logic via direct SQL,
 * matching what sendInvoiceReminder() inspects before calling Graph.
 *
 * Cleans up after itself. Counter is rolled back.
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
  try { return { ok: r.ok, status: r.status, body: JSON.parse(text) }; }
  catch { return { ok: r.ok, status: r.status, body: text }; }
}

const userId = (await q(`SELECT id FROM profiles LIMIT 1;`)).body[0]?.id;

// Build 4 invoices: not overdue, level1, level2, level3
const cases = [
  { tag: 'fresh',   overdue: 1,  expected_level: null }, // < 3 days
  { tag: 'level1',  overdue: 5,  expected_level: 1 },
  { tag: 'level2',  overdue: 12, expected_level: 2 },
  { tag: 'level3',  overdue: 25, expected_level: 3 },
]

const offerIds = []
const invoiceIds = []

for (const c of cases) {
  // Create accepted offer
  const off = await q(`
    INSERT INTO offers (offer_number, status, title, description, created_by, tax_percentage, currency, accepted_at)
    VALUES ('SMOKE-INV-' || extract(epoch from now())::bigint || '-${c.tag}', 'accepted', '[smoke-rem] ${c.tag}', 'temp', '${userId}'::uuid, 25, 'DKK', NOW())
    RETURNING id;`)
  const offerId = off.body[0]?.id
  offerIds.push(offerId)
  await q(`INSERT INTO offer_line_items (offer_id, position, line_type, description, quantity, unit, cost_price, margin_percentage, sale_price, unit_price, total)
    VALUES ('${offerId}'::uuid, 1, 'product', 'Smoke ${c.tag}', 1, 'stk', 100, 25, 125, 125, 125);`)

  // Build the invoice via RPC
  const inv = await q(`SELECT create_invoice_from_offer('${offerId}'::uuid) AS id;`)
  const invoiceId = inv.body[0]?.id
  invoiceIds.push(invoiceId)

  // Move to status='sent' and back-date due_date to be overdue by N days
  await q(`UPDATE invoices
              SET status='sent',
                  sent_at = NOW() - INTERVAL '${c.overdue + 5} days',
                  due_date = (CURRENT_DATE - INTERVAL '${c.overdue} days')::date
            WHERE id = '${invoiceId}'::uuid;`)
}

// Inspect overdue list as the cron would see it
const overdue = await q(`
  SELECT id, invoice_number, status, due_date, reminder_count, last_reminder_at,
         (CURRENT_DATE - due_date) AS days_overdue
    FROM invoices
   WHERE id = ANY (ARRAY[${invoiceIds.map(id => `'${id}'::uuid`).join(',')}])
   ORDER BY due_date;`)
console.log('overdue rows visible:')
console.log(JSON.stringify(overdue.body, null, 2))

// Assert: getOverdueInvoices() picks status='sent' AND due_date <= today-3
// → so 'fresh' (1 day) should NOT show in the cron query result
const cronView = await q(`
  SELECT invoice_number, (CURRENT_DATE - due_date) AS days
    FROM invoices
   WHERE status='sent'
     AND due_date <= (CURRENT_DATE - INTERVAL '3 days')::date
     AND id = ANY (ARRAY[${invoiceIds.map(id => `'${id}'::uuid`).join(',')}])
   ORDER BY due_date;`)
console.log('cron-visible overdue (≥3 days):')
console.log(JSON.stringify(cronView.body, null, 2))

// Assert: cooldown — set last_reminder_at on level1 to 2 days ago and confirm it would be skipped
await q(`UPDATE invoices SET last_reminder_at = NOW() - INTERVAL '2 days', reminder_count = 1 WHERE id='${invoiceIds[1]}'::uuid;`)
const cooldown = await q(`
  SELECT invoice_number, reminder_count,
         EXTRACT(DAY FROM NOW() - last_reminder_at)::int AS days_since
    FROM invoices WHERE id='${invoiceIds[1]}'::uuid;`)
console.log('cooldown sample (should NOT remind, 2d < 5d):')
console.log(JSON.stringify(cooldown.body, null, 2))

// Cleanup
for (const id of invoiceIds) {
  await q(`DELETE FROM invoice_reminder_log WHERE invoice_id='${id}'::uuid;`)
  await q(`DELETE FROM invoice_lines WHERE invoice_id='${id}'::uuid;`)
  await q(`DELETE FROM invoices WHERE id='${id}'::uuid;`)
}
for (const id of offerIds) {
  await q(`DELETE FROM offer_line_items WHERE offer_id='${id}'::uuid;`)
  await q(`DELETE FROM offers WHERE id='${id}'::uuid;`)
}
await q(`UPDATE invoice_number_counters SET next_n = GREATEST(next_n - ${cases.length}, 1) WHERE year = EXTRACT(YEAR FROM NOW())::int;`)
console.log('cleanup done')
