/**
 * Smoke test for Phase 5.2 invoice send + payment tracking.
 * Pure SQL — does not actually call Microsoft Graph (so no real email).
 *
 * Steps:
 *  1. create accepted offer + line, build invoice (final_amount = 312.50)
 *  2. simulate sendInvoiceEmail success: status=draft → sent
 *  3. attempt second "send" → expect already_sent (status check guard)
 *  4. registerPayment 100 → partial, amount_paid=100
 *  5. registerPayment 100 → still partial, amount_paid=200
 *  6. registerPayment 200 → paid (over by 87.50), status=paid, paid_at set
 *  7. registerPayment again 50 → audit row recorded but invoice unchanged
 *  8. cleanup
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

// 1. accepted offer + line
const off = await q(`
  INSERT INTO offers (offer_number, status, title, description, created_by, tax_percentage, currency, accepted_at)
  VALUES ('SMOKE-PAY-' || extract(epoch from now())::bigint, 'accepted', '[smoke-pay]', 'temp', '${userId}'::uuid, 25, 'DKK', NOW())
  RETURNING id;`)
const offerId = off.body[0]?.id
await q(`INSERT INTO offer_line_items (offer_id, position, line_type, description, quantity, unit, cost_price, margin_percentage, sale_price, unit_price, total)
  VALUES ('${offerId}'::uuid, 1, 'product', 'Smoke pay', 2, 'stk', 100, 25, 125, 125, 250);`)

const inv = await q(`SELECT create_invoice_from_offer('${offerId}'::uuid) AS id;`)
const invoiceId = inv.body[0]?.id
console.log('invoice:', invoiceId)
const initial = await q(`SELECT invoice_number, status, payment_status, amount_paid, final_amount FROM invoices WHERE id='${invoiceId}'::uuid;`)
console.log('initial:', initial.body)

// 2. simulate sendInvoiceEmail success path: draft → sent
//    (we cannot call Graph from this script, but we can replicate the
//    DB transition that sendInvoiceEmail would do on success)
const send1 = await q(`
  UPDATE invoices
     SET status='sent', sent_at=NOW(), payment_reference=invoice_number
   WHERE id='${invoiceId}'::uuid AND status='draft'
   RETURNING status, sent_at IS NOT NULL AS sent_at_set, payment_reference;`)
console.log('send 1 (draft→sent):', send1.body)

// 3. second attempt — guarded by `eq('status','draft')` → no rows changed
const send2 = await q(`
  UPDATE invoices
     SET status='sent', sent_at=NOW()
   WHERE id='${invoiceId}'::uuid AND status='draft'
   RETURNING id;`)
console.log('send 2 (must be empty array, "already_sent"):', send2.body)

// 4-7. payment progression — replicate the registerPayment logic in SQL
async function registerPayment(amt, ref) {
  await q(`INSERT INTO invoice_payments (invoice_id, amount, reference) VALUES ('${invoiceId}'::uuid, ${amt}, ${ref ? `'${ref}'` : 'NULL'});`)
  // Recompute payment_status / status from invoice row
  const r = await q(`
    WITH curr AS (SELECT amount_paid, final_amount, status, payment_status FROM invoices WHERE id='${invoiceId}'::uuid)
    UPDATE invoices i
       SET amount_paid    = curr.amount_paid + ${amt},
           payment_status = CASE
             WHEN (curr.amount_paid + ${amt}) >= curr.final_amount THEN 'paid'
             WHEN (curr.amount_paid + ${amt}) > 0 THEN 'partial'
             ELSE 'pending'
           END,
           status   = CASE WHEN curr.payment_status='paid' THEN i.status
                           WHEN (curr.amount_paid + ${amt}) >= curr.final_amount THEN 'paid'
                           ELSE i.status END,
           paid_at  = CASE WHEN i.paid_at IS NOT NULL THEN i.paid_at
                           WHEN (curr.amount_paid + ${amt}) >= curr.final_amount THEN NOW()
                           ELSE NULL END
      FROM curr
     WHERE i.id='${invoiceId}'::uuid AND curr.payment_status <> 'paid'
     RETURNING i.amount_paid, i.payment_status, i.status, i.paid_at IS NOT NULL AS paid_at_set;`)
  return r.body
}

console.log('pay 100:', await registerPayment(100, 'BANK-1'))
console.log('pay 100:', await registerPayment(100, 'BANK-2'))
console.log('pay 200:', await registerPayment(200, 'BANK-3')) // tips over final_amount=312.50

// 7. another payment after fully paid — should NOT change invoice
const before = await q(`SELECT amount_paid, payment_status, status FROM invoices WHERE id='${invoiceId}'::uuid;`)
console.log('after fully paid:', before.body)
console.log('pay 50 (already paid):', await registerPayment(50, 'BANK-4'))
const after = await q(`SELECT amount_paid, payment_status, status FROM invoices WHERE id='${invoiceId}'::uuid;`)
console.log('still:', after.body)

// audit log of payments
const audit = await q(`SELECT amount, reference, recorded_at FROM invoice_payments WHERE invoice_id='${invoiceId}'::uuid ORDER BY recorded_at;`)
console.log('audit rows:', audit.body)

// cleanup
await q(`DELETE FROM invoice_payments WHERE invoice_id='${invoiceId}'::uuid;`)
await q(`DELETE FROM invoice_lines WHERE invoice_id='${invoiceId}'::uuid;`)
await q(`DELETE FROM invoices WHERE id='${invoiceId}'::uuid;`)
await q(`DELETE FROM offer_line_items WHERE offer_id='${offerId}'::uuid;`)
await q(`DELETE FROM offers WHERE id='${offerId}'::uuid;`)
await q(`UPDATE invoice_number_counters SET next_n = GREATEST(next_n - 1, 1) WHERE year = EXTRACT(YEAR FROM NOW())::int;`)
console.log('cleanup done')
