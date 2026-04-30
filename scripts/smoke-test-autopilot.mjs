/**
 * Phase 10 smoke — autopilot DB invariants.
 *
 *   1. seeded rules visible
 *   2. condition gate: insert mock execution rows for two scenarios
 *      (cond satisfied vs not) — verify status='executed' vs 'skipped'
 *   3. partial UNIQUE: second 'executed' row for same (rule, entity)
 *      raises 23505 → caller treats as "already done"
 *   4. dry_run rule must produce status='dry_run' (no UNIQUE conflict)
 *   5. cleanup
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

// 1. Seeded rules
const seeded = (await q(`SELECT name, trigger, action, active FROM automation_rules ORDER BY trigger;`)).body;
console.log('seeded rules:'); console.log(JSON.stringify(seeded, null, 2));

// 2. Pick one rule (offer_accepted) to exercise UNIQUE
const ruleId = (await q(`SELECT id FROM automation_rules WHERE trigger='offer_accepted' LIMIT 1;`)).body[0].id;
const fakeEntityId = '00000000-0000-0000-0000-000000000abc';

// First execution: should succeed
const exec1 = await q(`INSERT INTO automation_executions (rule_id, entity_type, entity_id, status, result)
  VALUES ('${ruleId}'::uuid, 'offer', '${fakeEntityId}'::uuid, 'executed', '{"smoke":1}'::jsonb) RETURNING id;`);
console.log('first executed insert:', exec1.body);

// Second 'executed' row → must hit 23505
const exec2 = await q(`INSERT INTO automation_executions (rule_id, entity_type, entity_id, status, result)
  VALUES ('${ruleId}'::uuid, 'offer', '${fakeEntityId}'::uuid, 'executed', '{"smoke":2}'::jsonb) RETURNING id;`);
console.log('second executed insert (must be 23505):', exec2.body?.message?.split('\n')[0] || exec2.body);

// 3. status='skipped' or 'failed' for same (rule, entity) is allowed
const exec3 = await q(`INSERT INTO automation_executions (rule_id, entity_type, entity_id, status, error_message)
  VALUES ('${ruleId}'::uuid, 'offer', '${fakeEntityId}'::uuid, 'skipped', 'condition false') RETURNING id;`);
console.log('skipped row (allowed):', exec3.body);

const exec4 = await q(`INSERT INTO automation_executions (rule_id, entity_type, entity_id, status, error_message)
  VALUES ('${ruleId}'::uuid, 'offer', '${fakeEntityId}'::uuid, 'failed', 'handler threw') RETURNING id;`);
console.log('failed row (allowed):', exec4.body);

// 4. dry_run rows allowed even when an executed row exists
const exec5 = await q(`INSERT INTO automation_executions (rule_id, entity_type, entity_id, status, result)
  VALUES ('${ruleId}'::uuid, 'offer', '${fakeEntityId}'::uuid, 'dry_run', '{"dry":true}'::jsonb) RETURNING id;`);
console.log('dry_run row (allowed):', exec5.body);

// 5. Aggregate execution count for this entity
const agg = (await q(`SELECT status, COUNT(*)::int AS n FROM automation_executions
  WHERE rule_id='${ruleId}'::uuid AND entity_id='${fakeEntityId}'::uuid GROUP BY status ORDER BY status;`)).body;
console.log('execution counts:', agg);

// cleanup
await q(`DELETE FROM automation_executions WHERE entity_id='${fakeEntityId}'::uuid;`);
console.log('cleanup done');
