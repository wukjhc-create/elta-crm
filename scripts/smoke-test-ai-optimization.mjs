/**
 * Phase 9 smoke — AI optimization layer.
 *
 *   1. Create a low-margin profit snapshot → trigger marks WO low_profit
 *      AND inserts a margin_alert into ai_suggestions
 *   2. Subsequent healthy snapshot un-flags it
 *   3. Replay pricing optimization queries (median + variance) against
 *      seeded snapshot data
 *   4. Forecast aggregation against existing offers
 *   5. Dashboard insights query smoke (counts/medians)
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

// ---- setup: customer + WO ----
const custId = (await q(`INSERT INTO customers (customer_number, company_name, contact_person, email, created_by, is_active)
  VALUES ('SMOKE-AI-' || extract(epoch from now())::bigint, 'AI Customer', 'Pers', 'p@ai.dk', '${userId}'::uuid, true) RETURNING id;`)).body[0].id;
const woId = (await q(`INSERT INTO work_orders (customer_id, title, status) VALUES ('${custId}'::uuid, 'AI smoke WO', 'planned') RETURNING id, low_profit;`)).body[0].id;
console.log('seed WO:', woId);

// ---- 1. low-margin snapshot triggers low_profit + margin_alert ----
await q(`SELECT snapshot_work_order_profit('${woId}'::uuid, 'manual');`);  // initial 0/0 — not low (revenue=0 path)
// Manually insert a low-margin snapshot to exercise the trigger
const lowSnap = (await q(`INSERT INTO work_order_profit (work_order_id, revenue, labor_cost, material_cost, total_cost, profit, margin_percentage, source)
  VALUES ('${woId}'::uuid, 10000, 8000, 1500, 9500, 500, 5.00, 'manual') RETURNING id;`)).body[0].id;
console.log('low-margin snapshot:', lowSnap);

const woAfterLow = (await q(`SELECT low_profit FROM work_orders WHERE id='${woId}'::uuid;`)).body[0];
console.log('WO low_profit after low snapshot (must be true):', woAfterLow);

const alertRow = (await q(`SELECT type, message, payload->>'margin_percentage' AS pct
  FROM ai_suggestions
  WHERE entity_type='work_order' AND entity_id='${woId}'::uuid
  ORDER BY created_at DESC LIMIT 3;`)).body;
console.log('ai_suggestions row(s):'); console.log(JSON.stringify(alertRow, null, 2));

// ---- 2. healthy snapshot clears the flag ----
await q(`INSERT INTO work_order_profit (work_order_id, revenue, labor_cost, material_cost, total_cost, profit, margin_percentage, source)
  VALUES ('${woId}'::uuid, 10000, 4000, 2000, 6000, 4000, 40.00, 'recompute');`);
const woAfterHealthy = (await q(`SELECT low_profit FROM work_orders WHERE id='${woId}'::uuid;`)).body[0];
console.log('WO low_profit after healthy snapshot (must be false):', woAfterHealthy);

// ---- 3. pricing optimization data probe (replays the same query) ----
const targetCost = 6000;
const lo = targetCost * 0.5;
const hi = targetCost * 1.5;
const sample = (await q(`SELECT margin_percentage, revenue, total_cost FROM work_order_profit
  WHERE revenue > 0 AND total_cost BETWEEN ${lo} AND ${hi}
  ORDER BY created_at DESC LIMIT 60;`)).body;
console.log(`pricing samples in cost range ${lo}..${hi}:`, sample.length);

// ---- 4. forecast probe ----
const pipeline = (await q(`SELECT COALESCE(SUM(final_amount), 0)::float AS v
  FROM offers WHERE status IN ('draft','sent','viewed');`)).body[0].v;
const accepted90 = (await q(`SELECT COALESCE(SUM(final_amount), 0)::float AS v
  FROM offers WHERE status='accepted' AND accepted_at >= NOW() - INTERVAL '30 days';`)).body[0].v;
const conv = (await q(`SELECT
    COUNT(*) FILTER (WHERE status='accepted')::float AS a,
    COUNT(*) FILTER (WHERE status='rejected')::float AS r
  FROM offers WHERE updated_at >= NOW() - INTERVAL '90 days' AND status IN ('accepted','rejected');`)).body[0];
const convRate = (Number(conv.a) + Number(conv.r) > 0) ? Number(conv.a) / (Number(conv.a) + Number(conv.r)) : 0.4;
console.log('forecast inputs: pipeline=', pipeline, 'accepted_30d=', accepted90, 'convRate=', convRate.toFixed(3));

// ---- 5. dashboard low-profit count ----
const lpCount = (await q(`SELECT COUNT(*)::int AS n FROM work_orders WHERE low_profit = true;`)).body[0].n;
console.log('low_profit WO count (global):', lpCount);

// ---- cleanup ----
await q(`DELETE FROM ai_suggestions WHERE entity_type='work_order' AND entity_id='${woId}'::uuid;`);
await q(`DELETE FROM work_order_profit WHERE work_order_id='${woId}'::uuid;`);
await q(`DELETE FROM work_orders WHERE id='${woId}'::uuid;`);
await q(`DELETE FROM customers WHERE id='${custId}'::uuid;`);
console.log('cleanup done');
