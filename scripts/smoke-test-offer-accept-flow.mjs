/**
 * Smoke test: simulate triggerInvoiceFlowOnAccept against the prod RPC.
 *
 *  1. accept offer (status='accepted')
 *  2. call create_invoice_from_offer twice
 *     - first call → fresh invoice
 *     - second call → SAME id (idempotent at DB level)
 *  3. simulate sendInvoiceEmail draft → sent (race-safe UPDATE)
 *  4. confirm UNIQUE(offer_id) blocks any second invoice insert
 *  5. cleanup
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

// 1. create accepted offer
const off = await q(`
  INSERT INTO offers (offer_number, status, title, description, created_by, tax_percentage, currency, accepted_at)
  VALUES ('SMOKE-FLOW-' || extract(epoch from now())::bigint, 'accepted', '[smoke flow]', 'temp', '${userId}'::uuid, 25, 'DKK', NOW())
  RETURNING id;`)
const offerId = off.body[0]?.id
await q(`INSERT INTO offer_line_items (offer_id, position, line_type, description, quantity, unit, cost_price, margin_percentage, sale_price, unit_price, total)
  VALUES ('${offerId}'::uuid, 1, 'product', 'Smoke flow item', 1, 'stk', 100, 25, 125, 125, 125);`)

// 2. first invoice flow
const first = await q(`SELECT create_invoice_from_offer('${offerId}'::uuid) AS id;`)
const invoiceId = first.body[0]?.id
console.log('first call → invoice:', invoiceId)

// 2b. second flow trigger → must return same id (idempotent)
const second = await q(`SELECT create_invoice_from_offer('${offerId}'::uuid) AS id;`)
console.log('second call → same id?', second.body[0]?.id === invoiceId, second.body[0])

// 3. simulate email send: race-safe UPDATE
const sendA = await q(`
  UPDATE invoices SET status='sent', sent_at=NOW(), payment_reference=invoice_number
   WHERE id='${invoiceId}'::uuid AND status='draft'
   RETURNING status;`)
console.log('send A (draft→sent):', sendA.body)

const sendB = await q(`
  UPDATE invoices SET status='sent', sent_at=NOW()
   WHERE id='${invoiceId}'::uuid AND status='draft'
   RETURNING status;`)
console.log('send B (already sent → empty):', sendB.body)

// 4. UNIQUE(offer_id) blocks a manual duplicate insert
const dup = await q(`
  INSERT INTO invoices (invoice_number, customer_id, offer_id, status, total_amount, tax_amount, final_amount, currency, due_date)
  VALUES ('DUP-' || extract(epoch from now())::bigint, NULL, '${offerId}'::uuid, 'draft', 100, 25, 125, 'DKK', CURRENT_DATE)
  RETURNING id;`)
console.log('duplicate insert (must fail):', dup.body)

// final state
const state = await q(`SELECT invoice_number, status, payment_status, amount_paid, final_amount FROM invoices WHERE id='${invoiceId}'::uuid;`)
console.log('final state:', state.body)
const count = await q(`SELECT COUNT(*)::int AS n FROM invoices WHERE offer_id='${offerId}'::uuid;`)
console.log('invoices for offer (must be 1):', count.body)

// cleanup
await q(`DELETE FROM invoice_payments WHERE invoice_id='${invoiceId}'::uuid;`)
await q(`DELETE FROM invoice_lines WHERE invoice_id='${invoiceId}'::uuid;`)
await q(`DELETE FROM invoices WHERE id='${invoiceId}'::uuid;`)
await q(`DELETE FROM offer_line_items WHERE offer_id='${offerId}'::uuid;`)
await q(`DELETE FROM offers WHERE id='${offerId}'::uuid;`)
await q(`UPDATE invoice_number_counters SET next_n = GREATEST(next_n - 1, 1) WHERE year = EXTRACT(YEAR FROM NOW())::int;`)
console.log('cleanup done')
