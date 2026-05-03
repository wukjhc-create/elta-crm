// Sprint 4C pre-flight — confirm time_logs schema before building actions/UI.
import fs from 'fs'

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const t = l.trim()
  if (!t || t.startsWith('#')) continue
  const i = t.indexOf('=')
  if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim()
}
const ref = env.NEXT_PUBLIC_SUPABASE_URL.replace('https://', '').split('.')[0]

async function q(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  })
  return { status: r.status, text: await r.text() }
}

console.log('=== time_logs columns ===')
const cols = await q(`
  SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'time_logs'
  ORDER BY ordinal_position;
`)
console.log(cols.text, '\n')

console.log('=== time_logs FKs ===')
const fks = await q(`
  SELECT
    tc.constraint_name,
    kcu.column_name,
    ccu.table_name AS references_table,
    ccu.column_name AS references_column,
    rc.delete_rule
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
  JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name
  JOIN information_schema.referential_constraints rc
    ON rc.constraint_name = tc.constraint_name
  WHERE tc.table_schema = 'public'
    AND tc.table_name = 'time_logs'
    AND tc.constraint_type = 'FOREIGN KEY';
`)
console.log(fks.text, '\n')

console.log('=== time_logs indexes ===')
const idx = await q(`
  SELECT indexname, indexdef
  FROM pg_indexes
  WHERE schemaname = 'public' AND tablename = 'time_logs'
  ORDER BY indexname;
`)
console.log(idx.text, '\n')

console.log('=== time_logs row counts ===')
const counts = await q(`
  SELECT
    COUNT(*) AS total,
    COUNT(end_time) AS completed,
    COUNT(*) FILTER (WHERE end_time IS NULL) AS active_timers,
    COUNT(invoice_line_id) AS invoiced,
    COUNT(DISTINCT work_order_id) AS work_orders_with_logs
  FROM time_logs;
`)
console.log(counts.text, '\n')

console.log('=== triggers on time_logs ===')
const triggers = await q(`
  SELECT trigger_name, event_manipulation, action_timing, action_statement
  FROM information_schema.triggers
  WHERE event_object_schema = 'public' AND event_object_table = 'time_logs';
`)
console.log(triggers.text, '\n')

console.log('✅ Schema inspect complete.')
