/**
 * Phase 7.1 smoke — full lifecycle:
 *
 *   - 2 employees with different hourly rates (one explicit, one default)
 *   - 1 work order, status=done
 *   - 3 time logs split across the two employees (billable + non-billable)
 *   - Optional: an accepted offer with material lines, linked via source_offer_id
 *
 *   Then:
 *     1. RPC must REJECT non-done work order
 *     2. RPC creates invoice — verify time + material lines, totals, VAT
 *     3. Second RPC call → SAME invoice id (idempotent)
 *     4. Time logs marked invoice_line_id (un-billable second time)
 *     5. UNIQUE(work_order_id) blocks manual duplicate
 *     6. cleanup
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

// ---- setup ----
const empA = (await q(`INSERT INTO employees (name, email, role, hourly_rate)
  VALUES ('Alice Tech', 'alice-${Date.now()}@example.com', 'electrician', 800) RETURNING id;`)).body[0].id;
const empB = (await q(`INSERT INTO employees (name, email, role, hourly_rate)
  VALUES ('Bob Tech', 'bob-${Date.now()}@example.com', 'installer', NULL) RETURNING id;`)).body[0].id;
const custId = (await q(`INSERT INTO customers (customer_number, company_name, contact_person, email, created_by, is_active)
  VALUES ('SMOKE-WO-INV-' || extract(epoch from now())::bigint, 'WO Inv Cust', 'Pers', 'p@wo.dk', '${userId}'::uuid, true) RETURNING id;`)).body[0].id;

// optional offer w/ material
const offerNo = 'SMOKE-WO-OFFER-' + Date.now();
const offerId = (await q(`INSERT INTO offers (offer_number, status, title, description, customer_id, created_by, tax_percentage, currency, accepted_at)
  VALUES ('${offerNo}', 'accepted', 'Materials offer', 'temp', '${custId}'::uuid, '${userId}'::uuid, 25, 'DKK', NOW()) RETURNING id;`)).body[0].id;
await q(`INSERT INTO offer_line_items (offer_id, position, line_type, description, quantity, unit, cost_price, margin_percentage, sale_price, unit_price, total)
  VALUES ('${offerId}'::uuid, 1, 'product', 'Eltavle 4-rk', 1, 'stk', 1200, 30, 1560, 1560, 1560);`)
await q(`INSERT INTO offer_line_items (offer_id, position, line_type, description, quantity, unit, cost_price, margin_percentage, sale_price, unit_price, total)
  VALUES ('${offerId}'::uuid, 2, 'product', 'Kabel 3x2,5', 50, 'm', 8, 30, 10.40, 10.40, 520);`)

// work order — status=planned at first
const woId = (await q(`INSERT INTO work_orders (customer_id, title, status, source_offer_id, auto_invoice_on_done)
  VALUES ('${custId}'::uuid, 'Smoke WO with materials', 'planned', '${offerId}'::uuid, false) RETURNING id;`)).body[0].id;

// time logs:
//  - Alice 2.5h billable (yields 2.5 × 800 = 2000)
//  - Alice 1.0h billable (combined → 3.5 × 800 = 2800)
//  - Bob 1.5h billable (1.5 × 650 default = 975)
//  - Bob 0.5h NON-billable (must NOT appear)
await q(`INSERT INTO time_logs (employee_id, work_order_id, start_time, end_time, billable)
  VALUES ('${empA}'::uuid, '${woId}'::uuid, NOW() - INTERVAL '6 hours', NOW() - INTERVAL '3.5 hours', true);`)
await q(`INSERT INTO time_logs (employee_id, work_order_id, start_time, end_time, billable)
  VALUES ('${empA}'::uuid, '${woId}'::uuid, NOW() - INTERVAL '3.0 hours', NOW() - INTERVAL '2.0 hours', true);`)
await q(`INSERT INTO time_logs (employee_id, work_order_id, start_time, end_time, billable)
  VALUES ('${empB}'::uuid, '${woId}'::uuid, NOW() - INTERVAL '2.0 hours', NOW() - INTERVAL '0.5 hours', true);`)
await q(`INSERT INTO time_logs (employee_id, work_order_id, start_time, end_time, billable)
  VALUES ('${empB}'::uuid, '${woId}'::uuid, NOW() - INTERVAL '0.5 hours', NOW() - INTERVAL '0.0 hours', false);`)

// ---- 1. RPC must REJECT non-done work order ----
const reject = await q(`SELECT create_invoice_from_work_order('${woId}'::uuid) AS id;`)
console.log('reject (non-done):', reject.body?.message?.split('\n')[0] || reject.body)

// move to done
await q(`UPDATE work_orders SET status='done', completed_at=NOW() WHERE id='${woId}'::uuid;`)

// ---- 2. RPC creates invoice ----
const first = (await q(`SELECT create_invoice_from_work_order('${woId}'::uuid) AS id;`)).body[0]?.id
console.log('invoice id:', first)
const inv = (await q(`SELECT invoice_number, total_amount, tax_amount, final_amount, currency, work_order_id, due_date FROM invoices WHERE id='${first}'::uuid;`)).body
console.log('invoice header:'); console.log(JSON.stringify(inv, null, 2))
const lines = (await q(`SELECT position, description, quantity, unit, unit_price, total_price FROM invoice_lines WHERE invoice_id='${first}'::uuid ORDER BY position;`)).body
console.log('invoice lines:'); console.log(JSON.stringify(lines, null, 2))

// ---- 3. Idempotent ----
const second = (await q(`SELECT create_invoice_from_work_order('${woId}'::uuid) AS id;`)).body[0]?.id
console.log('second call → same id?', second === first, second)

// ---- 4. Time logs marked invoice_line_id ----
const billed = (await q(`SELECT employee_id, COUNT(*)::int AS billed_logs FROM time_logs WHERE work_order_id='${woId}'::uuid AND invoice_line_id IS NOT NULL GROUP BY employee_id;`)).body
console.log('time logs marked billed:', billed)
const notBilled = (await q(`SELECT employee_id, billable FROM time_logs WHERE work_order_id='${woId}'::uuid AND invoice_line_id IS NULL;`)).body
console.log('time logs NOT billed (must be non-billable Bob row only):', notBilled)

// ---- 5. UNIQUE(work_order_id) blocks manual duplicate insert ----
const dup = await q(`INSERT INTO invoices (invoice_number, customer_id, work_order_id, status, total_amount, tax_amount, final_amount, currency, due_date)
  VALUES ('DUP-WO-' || extract(epoch from now())::bigint, '${custId}'::uuid, '${woId}'::uuid, 'draft', 1, 0, 1, 'DKK', CURRENT_DATE) RETURNING id;`)
console.log('duplicate insert (must be 23505):', dup.body?.message?.split('\n')[0] || dup.body)

// ---- 6. cleanup ----
await q(`UPDATE time_logs SET invoice_line_id = NULL WHERE work_order_id='${woId}'::uuid;`)
await q(`DELETE FROM invoice_lines WHERE invoice_id='${first}'::uuid;`)
await q(`DELETE FROM invoices WHERE id='${first}'::uuid;`)
await q(`DELETE FROM time_logs WHERE work_order_id='${woId}'::uuid;`)
await q(`DELETE FROM work_orders WHERE id='${woId}'::uuid;`)
await q(`DELETE FROM offer_line_items WHERE offer_id='${offerId}'::uuid;`)
await q(`DELETE FROM offers WHERE id='${offerId}'::uuid;`)
await q(`DELETE FROM customers WHERE id='${custId}'::uuid;`)
await q(`DELETE FROM employees WHERE id IN ('${empA}'::uuid, '${empB}'::uuid);`)
await q(`UPDATE invoice_number_counters SET next_n = GREATEST(next_n - 1, 1) WHERE year = EXTRACT(YEAR FROM NOW())::int;`)
console.log('cleanup done')
