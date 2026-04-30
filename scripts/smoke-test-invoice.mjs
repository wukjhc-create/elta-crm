/**
 * Smoke test for create_invoice_from_offer:
 *   1. create a draft offer with a single line item
 *   2. attempt invoice creation → must FAIL (offer not accepted)
 *   3. flip offer to accepted
 *   4. create invoice → must succeed
 *   5. call again → must return SAME invoice id (idempotent)
 *   6. verify totals, status flow draft → sent → paid
 *   7. cleanup all rows
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

// 1. create draft offer
const ofs = await q(`INSERT INTO offers (offer_number, status, title, description, created_by, tax_percentage, currency)
  VALUES ('SMOKE-INV-' || extract(epoch from now())::bigint, 'draft', '[smoke] invoice', 'temp', '${userId}'::uuid, 25, 'DKK')
  RETURNING id;`);
const offerId = ofs.body[0]?.id;
console.log('offer created:', offerId);

// add a line: cost 100, sale 125, qty 2 → line_total 250
await q(`INSERT INTO offer_line_items (offer_id, position, line_type, description, quantity, unit, cost_price, margin_percentage, sale_price, unit_price, total)
  VALUES ('${offerId}'::uuid, 1, 'product', 'Smoke item', 2, 'stk', 100, 25, 125, 125, 250);`);

// 2. invoice creation must fail because offer is draft
const fail = await q(`SELECT create_invoice_from_offer('${offerId}'::uuid) AS id;`);
console.log('expected fail (draft):', fail.body);

// 3. accept the offer
await q(`UPDATE offers SET status='accepted', accepted_at=NOW() WHERE id='${offerId}'::uuid;`);

// 4. first call → success
const first = await q(`SELECT create_invoice_from_offer('${offerId}'::uuid) AS id;`);
const invoiceId = first.body[0]?.id;
console.log('invoice created:', invoiceId);

// 5. second call → same id (idempotent)
const second = await q(`SELECT create_invoice_from_offer('${offerId}'::uuid) AS id;`);
console.log('idempotent? same id =', second.body[0]?.id === invoiceId, second.body);

// 6. inspect invoice
const inv = await q(`SELECT invoice_number, status, total_amount, tax_amount, final_amount, currency, due_date FROM invoices WHERE id='${invoiceId}'::uuid;`);
console.log('invoice:', inv.body);
const lines = await q(`SELECT position, description, quantity, unit_price, total_price FROM invoice_lines WHERE invoice_id='${invoiceId}'::uuid ORDER BY position;`);
console.log('lines:', lines.body);

// 6b. status flow draft → sent → paid (raw SQL — TS path tested separately)
await q(`UPDATE invoices SET status='sent', sent_at=NOW() WHERE id='${invoiceId}'::uuid;`);
await q(`UPDATE invoices SET status='paid', paid_at=NOW() WHERE id='${invoiceId}'::uuid;`);
const after = await q(`SELECT status, sent_at IS NOT NULL AS sent_set, paid_at IS NOT NULL AS paid_set FROM invoices WHERE id='${invoiceId}'::uuid;`);
console.log('flow draft→sent→paid:', after.body);

// 7. cleanup
await q(`DELETE FROM invoice_lines WHERE invoice_id='${invoiceId}'::uuid;`);
await q(`DELETE FROM invoices WHERE id='${invoiceId}'::uuid;`);
await q(`DELETE FROM offer_line_items WHERE offer_id='${offerId}'::uuid;`);
await q(`DELETE FROM offers WHERE id='${offerId}'::uuid;`);
// roll counter back so we don't burn a real number on testing
await q(`UPDATE invoice_number_counters SET next_n = GREATEST(next_n - 1, 1) WHERE year = EXTRACT(YEAR FROM NOW())::int;`);
console.log('cleanup done');
