/**
 * Smoke test for Phase 5.3 bank auto-match invariants.
 * Cleans up after itself.
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
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { ok: r.ok, status: r.status, body };
}

const userId = (await q(`SELECT id FROM profiles LIMIT 1;`)).body[0].id;

const acmeId = (await q(`INSERT INTO customers (customer_number, company_name, contact_person, email, created_by, is_active) VALUES ('SMOKE-A-' || extract(epoch from now())::bigint, 'Acme ApS', 'Jens', 'jens@acme.dk', '${userId}'::uuid, true) RETURNING id;`)).body[0].id;
const betaId = (await q(`INSERT INTO customers (customer_number, company_name, contact_person, email, created_by, is_active) VALUES ('SMOKE-B-' || extract(epoch from now())::bigint, 'Beta ApS', 'Lis', 'lis@beta.dk', '${userId}'::uuid, true) RETURNING id;`)).body[0].id;

async function mkInvoice({ tag, customerId, amount }) {
  const offerNo = 'SMOKE-BANK-' + Date.now() + '-' + tag;
  const offerId = (await q(`INSERT INTO offers (offer_number, status, title, description, customer_id, created_by, tax_percentage, currency, accepted_at)
    VALUES ('${offerNo}', 'accepted', '[smoke-bank] ${tag}', 'temp', '${customerId}'::uuid, '${userId}'::uuid, 0, 'DKK', NOW())
    RETURNING id;`)).body[0].id;
  await q(`INSERT INTO offer_line_items (offer_id, position, line_type, description, quantity, unit, cost_price, margin_percentage, sale_price, unit_price, total)
    VALUES ('${offerId}'::uuid, 1, 'product', 'Smoke ${tag}', 1, 'stk', ${amount}, 0, ${amount}, ${amount}, ${amount});`);
  const invoiceId = (await q(`SELECT create_invoice_from_offer('${offerId}'::uuid) AS id;`)).body[0].id;
  await q(`UPDATE invoices SET status='sent', sent_at=NOW(), payment_reference=invoice_number WHERE id='${invoiceId}'::uuid;`);
  const row = (await q(`SELECT invoice_number, final_amount FROM invoices WHERE id='${invoiceId}'::uuid;`)).body[0];
  return { offerId, invoiceId, invoice_number: row.invoice_number, final_amount: Number(row.final_amount) };
}

const i1 = await mkInvoice({ tag: 'A1', customerId: acmeId, amount: 312.50 });
const i2 = await mkInvoice({ tag: 'A2', customerId: acmeId, amount: 500.00 });
const i3 = await mkInvoice({ tag: 'B3', customerId: betaId, amount: 500.00 });
const i4 = await mkInvoice({ tag: 'B4', customerId: betaId, amount: 1000.00 });
console.log('invoices:', { i1: i1.invoice_number, i2: i2.invoice_number, i3: i3.invoice_number, i4: i4.invoice_number });

async function mkTx({ amount, ref, sender }) {
  const r = await q(`INSERT INTO bank_transactions (date, amount, reference_text, sender_name)
    VALUES (CURRENT_DATE, ${amount}, ${ref ? `'${ref.replace(/'/g, "''")}'` : 'NULL'}, ${sender ? `'${sender.replace(/'/g, "''")}'` : 'NULL'})
    RETURNING id;`);
  return r.body[0]?.id || null;
}

// All refs must be unique to satisfy uq_bank_tx_dedup (date+amount+ref).
const t1 = await mkTx({ amount: 312.50, ref: `Faktura ${i1.invoice_number} betaling`, sender: 'Acme ApS' });
const t2 = await mkTx({ amount: 500.00, ref: 'overforsel-acme',                       sender: 'Acme ApS' });
const t3 = await mkTx({ amount: 500.00, ref: 'overforsel-unknown',                    sender: 'Unknown Sender' });
const t4 = await mkTx({ amount: 9999.99, ref: 'overforsel-x',                          sender: 'Whoever' });
const t5 = await mkTx({ amount: 600.00, ref: 'overforsel-beta',                        sender: 'Beta ApS' });
const allTxIds = [t1, t2, t3, t4, t5];
console.log('bank_tx ids:', allTxIds);

// Replay matching outcomes (mirrors src/lib/services/bank-payments.ts logic):
async function applyExactMatch(txId, invoiceId, amount, refLabel, confidence) {
  await q(`UPDATE bank_transactions SET matched_invoice_id='${invoiceId}'::uuid,
              match_status='matched', match_confidence='${confidence}', matched_at=NOW()
            WHERE id='${txId}'::uuid AND matched_invoice_id IS NULL;`);
  await q(`INSERT INTO invoice_payments (invoice_id, amount, reference) VALUES ('${invoiceId}'::uuid, ${amount}, ${refLabel ? `'${refLabel.replace(/'/g, "''")}'` : 'NULL'});`);
  await q(`UPDATE invoices i SET amount_paid = i.amount_paid + ${amount},
            payment_status = CASE WHEN (i.amount_paid + ${amount}) >= i.final_amount THEN 'paid'
                                  WHEN (i.amount_paid + ${amount}) > 0 THEN 'partial'
                                  ELSE 'pending' END,
            status   = CASE WHEN (i.amount_paid + ${amount}) >= i.final_amount THEN 'paid' ELSE i.status END,
            paid_at  = CASE WHEN (i.amount_paid + ${amount}) >= i.final_amount AND i.paid_at IS NULL THEN NOW() ELSE i.paid_at END
          WHERE id='${invoiceId}'::uuid AND payment_status<>'paid';`);
  // Promote tx status to partial / overpayment if necessary
  const inv = (await q(`SELECT amount_paid, final_amount FROM invoices WHERE id='${invoiceId}'::uuid;`)).body[0];
  let final = 'matched';
  if (Number(inv.amount_paid) >= Number(inv.final_amount)) {
    if (amount > Number(inv.final_amount)) final = 'overpayment';
    else final = 'matched';
  } else final = 'partial';
  await q(`UPDATE bank_transactions SET match_status='${final}' WHERE id='${txId}'::uuid;`);
}

await applyExactMatch(t1, i1.invoiceId, 312.50, `Faktura ${i1.invoice_number} betaling`, 'reference');
await applyExactMatch(t2, i2.invoiceId, 500.00, 'overforsel-acme',                        'amount+sender');
await q(`UPDATE bank_transactions SET match_status='ambiguous',
            candidate_invoice_ids=ARRAY['${i2.invoiceId}'::uuid, '${i3.invoiceId}'::uuid]
          WHERE id='${t3}'::uuid AND matched_invoice_id IS NULL;`);
// t4 stays 'unmatched' (default)
// t5 stays 'unmatched' (no exact amount, no ref → not auto-applied)

const txs = (await q(`SELECT id, amount, match_status, match_confidence, matched_invoice_id IS NOT NULL AS bound, candidate_invoice_ids
                       FROM bank_transactions
                      WHERE id = ANY (ARRAY[${allTxIds.map(id => `'${id}'::uuid`).join(',')}])
                      ORDER BY created_at;`)).body;
console.log('bank_transactions outcome:'); console.log(JSON.stringify(txs, null, 2));

const inv = (await q(`SELECT invoice_number, status, payment_status, amount_paid, final_amount
                       FROM invoices WHERE id IN ('${i1.invoiceId}','${i2.invoiceId}','${i3.invoiceId}','${i4.invoiceId}')
                       ORDER BY invoice_number;`)).body;
console.log('invoices outcome:'); console.log(JSON.stringify(inv, null, 2));

// Safety: never overwrite a matched_invoice_id
const reclaim = (await q(`UPDATE bank_transactions SET matched_invoice_id='${i2.invoiceId}'::uuid, match_status='matched'
                           WHERE id='${t1}'::uuid AND matched_invoice_id IS NULL RETURNING id;`)).body;
console.log('reclaim attempt (must be empty):', reclaim);

// Dedup index works
const dup = (await q(`INSERT INTO bank_transactions (date, amount, reference_text, sender_name)
                       VALUES (CURRENT_DATE, 312.50, 'Faktura ${i1.invoice_number} betaling', 'Acme ApS') RETURNING id;`)).body;
console.log('dedup insert (must be 23505):', dup);

// Cleanup
await q(`DELETE FROM bank_transactions WHERE id = ANY (ARRAY[${allTxIds.map(id => `'${id}'::uuid`).join(',')}]);`);
for (const i of [i1, i2, i3, i4]) {
  await q(`DELETE FROM invoice_payments WHERE invoice_id='${i.invoiceId}'::uuid;`);
  await q(`DELETE FROM invoice_lines WHERE invoice_id='${i.invoiceId}'::uuid;`);
  await q(`DELETE FROM invoices WHERE id='${i.invoiceId}'::uuid;`);
  await q(`DELETE FROM offer_line_items WHERE offer_id='${i.offerId}'::uuid;`);
  await q(`DELETE FROM offers WHERE id='${i.offerId}'::uuid;`);
}
await q(`DELETE FROM customers WHERE id IN ('${acmeId}','${betaId}');`);
await q(`UPDATE invoice_number_counters SET next_n = GREATEST(next_n - 4, 1) WHERE year = EXTRACT(YEAR FROM NOW())::int;`);
console.log('cleanup done');
