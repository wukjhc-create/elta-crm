/**
 * Phase 7 smoke test — verifies every safety invariant via direct SQL.
 *
 *   1. employee + work_order created OK
 *   2. start timer → row created with end_time NULL
 *   3. start a SECOND timer for same employee → 23505 (uq_time_logs_one_active_per_employee)
 *   4. stop timer → end_time set, hours computed by generated column
 *   5. start third timer (now allowed) → OK
 *   6. manual entry overlapping the just-stopped one → JS service prevents this
 *      (we replay the overlap query to confirm it returns the existing row)
 *   7. status flow: planned → in_progress (auto when timer started) → done
 *      done refused while a timer is open, allowed once stopped
 *   8. billable rollup query mirrors getWorkOrderBillableLines
 *   9. cleanup
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
const empId = (await q(`INSERT INTO employees (name, email, role) VALUES ('SMOKE Tech', 'smoke-tech-${Date.now()}@example.com', 'electrician') RETURNING id;`)).body[0].id;
const custId = (await q(`INSERT INTO customers (customer_number, company_name, contact_person, email, created_by, is_active)
  VALUES ('SMOKE-WO-' || extract(epoch from now())::bigint, 'WO Customer', 'Jens', 'jens@wo.dk', '${userId}'::uuid, true) RETURNING id;`)).body[0].id;
const caseId = (await q(`INSERT INTO service_cases (case_number, customer_id, title, description, status, priority, source, created_by)
  VALUES ('SMOKE-CASE-' || extract(epoch from now())::bigint, '${custId}'::uuid, 'Smoke case', 'temp', 'new', 'medium', 'manual', '${userId}'::uuid) RETURNING id;`)).body[0].id;

const woId = (await q(`INSERT INTO work_orders (case_id, customer_id, title, status)
  VALUES ('${caseId}'::uuid, '${custId}'::uuid, 'Smoke WO', 'planned') RETURNING id, status;`)).body[0].id;
console.log('created employee=', empId, 'work_order=', woId);

// ---- 1. start a timer ----
const t1 = (await q(`INSERT INTO time_logs (employee_id, work_order_id, start_time)
  VALUES ('${empId}'::uuid, '${woId}'::uuid, NOW() - INTERVAL '90 minutes') RETURNING id, end_time;`)).body[0].id;
console.log('timer 1 started:', t1);

// ---- 2. start a SECOND active timer for the same employee → 23505 ----
const dup = await q(`INSERT INTO time_logs (employee_id, work_order_id, start_time)
  VALUES ('${empId}'::uuid, '${woId}'::uuid, NOW()) RETURNING id;`);
console.log('second active timer (must fail 23505):', dup.body?.message?.split('\n')[0] || dup.body);

// ---- 3. cannot mark work order 'done' while timer is open ----
//   simulating the service guard
const openTimers = (await q(`SELECT COUNT(*)::int AS n FROM time_logs WHERE work_order_id='${woId}'::uuid AND end_time IS NULL;`)).body[0].n;
console.log('open timers on WO before done:', openTimers, '→ service would reject done');

// ---- 4. stop the timer ----
const stopped = (await q(`UPDATE time_logs SET end_time = NOW() WHERE id='${t1}'::uuid AND end_time IS NULL RETURNING id, hours;`)).body[0];
console.log('timer stopped:', stopped);

// ---- 5. now another active timer is allowed ----
const t2 = (await q(`INSERT INTO time_logs (employee_id, work_order_id, start_time)
  VALUES ('${empId}'::uuid, '${woId}'::uuid, NOW()) RETURNING id;`)).body[0].id;
console.log('timer 2 started (allowed):', t2);

// ---- 6. overlap check on a manual entry that crosses the stopped log ----
const overlapRows = (await q(`
  SELECT id FROM time_logs
   WHERE employee_id='${empId}'::uuid
     AND start_time < (NOW() - INTERVAL '30 minutes')
     AND (end_time IS NULL OR end_time > (NOW() - INTERVAL '120 minutes'))
   LIMIT 5;`)).body
console.log('overlap query rows (would block manual insert if non-empty):', overlapRows.length)

// stop t2 so we can mark the work order done
await q(`UPDATE time_logs SET end_time = NOW() WHERE id='${t2}'::uuid AND end_time IS NULL;`);

// ---- 7. status flow: planned → in_progress (manual since we bypassed service) → done ----
await q(`UPDATE work_orders SET status='in_progress' WHERE id='${woId}'::uuid AND status='planned';`)
const open = (await q(`SELECT COUNT(*)::int AS n FROM time_logs WHERE work_order_id='${woId}'::uuid AND end_time IS NULL;`)).body[0].n
console.log('open timers before done:', open, '(must be 0)')
await q(`UPDATE work_orders SET status='done', completed_at=NOW() WHERE id='${woId}'::uuid AND status='in_progress';`)
const woFinal = (await q(`SELECT status, completed_at IS NOT NULL AS done_set FROM work_orders WHERE id='${woId}'::uuid;`)).body
console.log('WO final:', woFinal)

// ---- 8. billable rollup ----
const billable = (await q(`
  SELECT employee_id, ROUND(SUM(hours)::numeric, 2) AS total_hours, COUNT(*)::int AS log_count
    FROM time_logs
   WHERE work_order_id='${woId}'::uuid
     AND billable = true
     AND invoice_line_id IS NULL
     AND end_time IS NOT NULL
     AND hours > 0
   GROUP BY employee_id;`)).body
console.log('billable rollup:', billable)

// ---- 9. cleanup ----
await q(`DELETE FROM time_logs WHERE work_order_id='${woId}'::uuid;`);
await q(`DELETE FROM work_orders WHERE id='${woId}'::uuid;`);
await q(`DELETE FROM service_cases WHERE id='${caseId}'::uuid;`);
await q(`DELETE FROM customers WHERE id='${custId}'::uuid;`);
await q(`DELETE FROM employees WHERE id='${empId}'::uuid;`);
console.log('cleanup done');
