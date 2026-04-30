/**
 * Phase 8 smoke — full profitability flow.
 *
 *   - 2 employees: Alice (hourly_rate 800, cost_rate 500), Bob (defaults)
 *   - 1 work order with materials offer attached (source_offer_id)
 *   - 3 billable time logs → cost_amount auto-populated by trigger
 *   - planned-revenue path before invoice
 *   - status → done auto-creates first profit snapshot
 *   - createInvoiceFromWorkOrder fires → second snapshot using actual invoice
 *   - manual snapshot call appends a third row
 *   - history is preserved (never overwritten)
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

// Setup employees with explicit cost rates
const empA = (await q(`INSERT INTO employees (name, email, role, hourly_rate, cost_rate)
  VALUES ('Alice P8', 'alice-p8-${Date.now()}@example.com', 'electrician', 800, 500) RETURNING id;`)).body[0].id;
const empB = (await q(`INSERT INTO employees (name, email, role, hourly_rate, cost_rate)
  VALUES ('Bob P8', 'bob-p8-${Date.now()}@example.com', 'installer', NULL, NULL) RETURNING id;`)).body[0].id;
const custId = (await q(`INSERT INTO customers (customer_number, company_name, contact_person, email, created_by, is_active)
  VALUES ('SMOKE-P8-' || extract(epoch from now())::bigint, 'P8 Customer', 'Jens', 'p8@x.dk', '${userId}'::uuid, true) RETURNING id;`)).body[0].id;

// Materials offer (cost_price + supplier_cost_price_at_creation)
const offerNo = 'SMOKE-P8-OFFER-' + Date.now();
const offerId = (await q(`INSERT INTO offers (offer_number, status, title, description, customer_id, created_by, tax_percentage, currency, accepted_at)
  VALUES ('${offerNo}', 'accepted', 'P8 Materials', 'temp', '${custId}'::uuid, '${userId}'::uuid, 25, 'DKK', NOW()) RETURNING id;`)).body[0].id;
// Eltavle: cost 1200, sale 1560 (margin 30%)
await q(`INSERT INTO offer_line_items (offer_id, position, line_type, description, quantity, unit, cost_price, supplier_cost_price_at_creation, margin_percentage, sale_price, unit_price, total)
  VALUES ('${offerId}'::uuid, 1, 'product', 'Eltavle 4-rk', 1, 'stk', 1200, 1200, 30, 1560, 1560, 1560);`)
// Kabel: cost 8/m × 50 = 400 cost; sale 10.40/m × 50 = 520
await q(`INSERT INTO offer_line_items (offer_id, position, line_type, description, quantity, unit, cost_price, supplier_cost_price_at_creation, margin_percentage, sale_price, unit_price, total)
  VALUES ('${offerId}'::uuid, 2, 'product', 'Kabel 3x2,5', 50, 'm', 8, 8, 30, 10.40, 10.40, 520);`)
// Material cost = 1200 + (8 × 50) = 1600

const woId = (await q(`INSERT INTO work_orders (customer_id, title, status, source_offer_id)
  VALUES ('${custId}'::uuid, 'P8 WO', 'in_progress', '${offerId}'::uuid) RETURNING id;`)).body[0].id;

// Time logs:
// Alice 3.5h billable: cost_amount = 3.5 × 500 = 1750.00; revenue contribution 3.5 × 800 = 2800
// Bob 1.5h billable: cost_amount = 1.5 × 400 (default) = 600.00; revenue 1.5 × 650 (default) = 975
// Bob 0.5h non-billable: cost_amount = 0.5 × 400 = 200.00, no revenue impact
await q(`INSERT INTO time_logs (employee_id, work_order_id, start_time, end_time, billable)
  VALUES ('${empA}'::uuid, '${woId}'::uuid, NOW() - INTERVAL '6 hours', NOW() - INTERVAL '2.5 hours', true);`)
await q(`INSERT INTO time_logs (employee_id, work_order_id, start_time, end_time, billable)
  VALUES ('${empB}'::uuid, '${woId}'::uuid, NOW() - INTERVAL '2.5 hours', NOW() - INTERVAL '1.0 hours', true);`)
await q(`INSERT INTO time_logs (employee_id, work_order_id, start_time, end_time, billable)
  VALUES ('${empB}'::uuid, '${woId}'::uuid, NOW() - INTERVAL '1.0 hours', NOW() - INTERVAL '0.5 hours', false);`)

// Verify cost_amount populated by trigger
const tl = (await q(`SELECT employee_id, hours, cost_amount, billable FROM time_logs WHERE work_order_id='${woId}'::uuid ORDER BY start_time;`)).body
console.log('time_logs (cost_amount auto-populated):'); console.log(JSON.stringify(tl, null, 2))

// --- pre-invoice planned-revenue calculation ---
const planned = (await q(`SELECT calculate_work_order_profit('${woId}'::uuid);`)).body[0]
console.log('planned profit (no invoice yet):'); console.log(JSON.stringify(planned, null, 2))

// --- transition WO to done → trigger snapshots ---
await q(`UPDATE work_orders SET status='done', completed_at=NOW() WHERE id='${woId}'::uuid AND status='in_progress';`)
const snap1 = (await q(`SELECT id, source, revenue, labor_cost, material_cost, profit, margin_percentage FROM work_order_profit WHERE work_order_id='${woId}'::uuid ORDER BY created_at;`)).body
console.log('after WO done — snapshots:'); console.log(JSON.stringify(snap1, null, 2))

// --- create invoice → second snapshot (trigger) ---
const invoiceId = (await q(`SELECT create_invoice_from_work_order('${woId}'::uuid) AS id;`)).body[0].id
console.log('invoice created:', invoiceId)
const snap2 = (await q(`SELECT id, source, revenue, labor_cost, material_cost, profit, margin_percentage, created_at FROM work_order_profit WHERE work_order_id='${woId}'::uuid ORDER BY created_at;`)).body
console.log('after invoice — snapshots (must be ≥2 rows):'); console.log(JSON.stringify(snap2, null, 2))

// --- manual recompute → 3rd snapshot ---
const manualId = (await q(`SELECT snapshot_work_order_profit('${woId}'::uuid, 'manual') AS id;`)).body[0].id
console.log('manual snapshot id:', manualId)
const snap3 = (await q(`SELECT COUNT(*)::int AS n FROM work_order_profit WHERE work_order_id='${woId}'::uuid;`)).body
console.log('total snapshots (≥3):', snap3)

// --- safety: missing invoice path returns valid result ---
const orphanWo = (await q(`INSERT INTO work_orders (customer_id, title, status) VALUES ('${custId}'::uuid, 'orphan', 'planned') RETURNING id;`)).body[0].id
const orphan = (await q(`SELECT calculate_work_order_profit('${orphanWo}'::uuid);`)).body[0]
console.log('orphan WO (no time logs, no invoice):'); console.log(JSON.stringify(orphan, null, 2))

// cleanup
await q(`UPDATE time_logs SET invoice_line_id = NULL WHERE work_order_id='${woId}'::uuid;`)
await q(`DELETE FROM work_order_profit WHERE work_order_id IN ('${woId}'::uuid, '${orphanWo}'::uuid);`)
await q(`DELETE FROM invoice_lines WHERE invoice_id='${invoiceId}'::uuid;`)
await q(`DELETE FROM invoices WHERE id='${invoiceId}'::uuid;`)
await q(`DELETE FROM time_logs WHERE work_order_id='${woId}'::uuid;`)
await q(`DELETE FROM work_orders WHERE id IN ('${woId}'::uuid, '${orphanWo}'::uuid);`)
await q(`DELETE FROM offer_line_items WHERE offer_id='${offerId}'::uuid;`)
await q(`DELETE FROM offers WHERE id='${offerId}'::uuid;`)
await q(`DELETE FROM customers WHERE id='${custId}'::uuid;`)
await q(`DELETE FROM employees WHERE id IN ('${empA}'::uuid, '${empB}'::uuid);`)
await q(`UPDATE invoice_number_counters SET next_n = GREATEST(next_n - 1, 1) WHERE year = EXTRACT(YEAR FROM NOW())::int;`)
console.log('cleanup done')
