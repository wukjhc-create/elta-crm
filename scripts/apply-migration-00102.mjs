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

// Pre-state: capture existing row count + matched_case_id distribution (should be N/A pre-migration)
const pre = await q(`
  SELECT COUNT(*) AS total FROM incoming_invoices;
`)
console.log('pre-migration row count:', pre.text)

const sql = fs.readFileSync(
  'supabase/migrations/00102_incoming_invoices_matched_case_id.sql',
  'utf8'
)
const r = await q(sql)
console.log('apply:', r.status, r.text.substring(0, 800) || '(empty)')
await q("NOTIFY pgrst, 'reload schema';")

// Verify column
const col = await q(`
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='incoming_invoices'
    AND column_name='matched_case_id';
`)
console.log('column:', col.text)

// Verify FK
const fk = await q(`
  SELECT conname, pg_get_constraintdef(oid) AS def
  FROM pg_constraint
  WHERE conrelid = 'public.incoming_invoices'::regclass
    AND contype = 'f'
    AND pg_get_constraintdef(oid) ILIKE '%matched_case_id%';
`)
console.log('fk:', fk.text)

// Verify indexes
const idx = await q(`
  SELECT indexname, indexdef FROM pg_indexes
  WHERE schemaname='public' AND tablename='incoming_invoices'
    AND indexname LIKE '%case%'
  ORDER BY indexname;
`)
console.log('indexes:', idx.text)

// Verify no rows have matched_case_id set (we did not populate it)
const populated = await q(`
  SELECT COUNT(*) AS populated FROM incoming_invoices WHERE matched_case_id IS NOT NULL;
`)
console.log('populated:', populated.text)

// Verify total row count unchanged
const post = await q(`
  SELECT COUNT(*) AS total FROM incoming_invoices;
`)
console.log('post-migration row count:', post.text)
