/**
 * Smoke test for Phase 6 system health.
 *
 *   1. Insert representative log rows (ok / warning / error) across services
 *   2. Replay getSystemHealth() aggregation in SQL: per-service counts last hour
 *   3. Verify "errors > 5 in last hour → warning" rule transition
 *   4. Verify any error → service status='error' rule
 *   5. Cleanup test rows
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

const tag = 'SMOKE-HEALTH-' + Date.now();

// 1. seed: 6 errors on 'invoice' (triggers warning AND error), 1 warning on 'bank', mix on 'email'
for (let i = 0; i < 6; i++) {
  await q(`INSERT INTO system_health_log (service, status, message, metadata)
    VALUES ('invoice', 'error', '${tag} err ${i}', '{"tag":"${tag}"}'::jsonb);`)
}
await q(`INSERT INTO system_health_log (service, status, message, metadata) VALUES ('bank', 'warning', '${tag} warn', '{"tag":"${tag}"}'::jsonb);`)
await q(`INSERT INTO system_health_log (service, status, message, metadata) VALUES ('email', 'ok', '${tag} ok 1', '{"tag":"${tag}"}'::jsonb);`)
await q(`INSERT INTO system_health_log (service, status, message, metadata) VALUES ('email', 'ok', '${tag} ok 2', '{"tag":"${tag}"}'::jsonb);`)

// 2. aggregation per service in last hour
const agg = (await q(`
  SELECT service,
         COUNT(*) FILTER (WHERE status='error')   AS errors,
         COUNT(*) FILTER (WHERE status='warning') AS warns,
         COUNT(*) FILTER (WHERE status='ok')      AS oks,
         MAX(created_at) FILTER (WHERE status='error') AS last_error_at,
         MAX(message)    FILTER (WHERE status='error') AS sample_error_msg
    FROM system_health_log
   WHERE created_at >= NOW() - INTERVAL '1 hour'
     AND metadata->>'tag' = '${tag}'
   GROUP BY service
   ORDER BY service;
`)).body
console.log('aggregation:'); console.log(JSON.stringify(agg, null, 2))

// 3. derived rules check (mirror getSystemHealth's logic)
console.log('rules verdict:')
for (const row of agg) {
  const errors = Number(row.errors)
  const warns  = Number(row.warns)
  let status = 'ok'
  if (errors > 0) status = 'error'
  else if (errors + warns > 5) status = 'warning'
  else if (warns > 0) status = 'warning'
  console.log(`  ${row.service}: errors=${errors} warnings=${warns} → ${status}`)
}

// 4. recent errors list (top 5)
const recent = (await q(`
  SELECT service, message FROM system_health_log
   WHERE status='error' AND metadata->>'tag' = '${tag}'
   ORDER BY created_at DESC LIMIT 5;
`)).body
console.log('recent errors:', recent)

// 5. cleanup
await q(`DELETE FROM system_health_log WHERE metadata->>'tag' = '${tag}';`)
console.log('cleanup done')
