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

const pre = await q(`
  SELECT 'invoices' AS t, COUNT(*) FROM invoices
  UNION ALL SELECT 'invoice_lines', COUNT(*) FROM invoice_lines;
`)
console.log('pre:', pre.text)

const sql = fs.readFileSync(
  'supabase/migrations/00104_invoice_case_link_and_provenance.sql',
  'utf8'
)
const r = await q(sql)
console.log('apply:', r.status, r.text.substring(0, 800) || '(empty)')
await q("NOTIFY pgrst, 'reload schema';")

const colInv = await q(`
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='invoices' AND column_name='case_id';
`)
console.log('invoices.case_id:', colInv.text)

const colLines = await q(`
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='invoice_lines'
    AND column_name LIKE 'source_%'
  ORDER BY column_name;
`)
console.log('invoice_lines.source_*:', colLines.text)

const fk = await q(`
  SELECT conname, pg_get_constraintdef(oid)
  FROM pg_constraint
  WHERE (conrelid = 'public.invoices'::regclass OR conrelid = 'public.invoice_lines'::regclass)
    AND contype = 'f'
    AND (conname LIKE '%case_id%' OR conname LIKE '%source_time_log%'
         OR conname LIKE '%source_case_material%' OR conname LIKE '%source_case_other_cost%')
  ORDER BY conname;
`)
console.log('FKs:', fk.text)

const idx = await q(`
  SELECT indexname FROM pg_indexes
  WHERE schemaname='public'
    AND (tablename='invoices' OR tablename='invoice_lines')
    AND (indexname LIKE '%case_id%' OR indexname LIKE 'uq_invoice_lines_source%')
  ORDER BY indexname;
`)
console.log('indexes:', idx.text)

const populated = await q(`
  SELECT
    (SELECT COUNT(*) FROM invoices WHERE case_id IS NOT NULL) AS inv_case_id_set,
    (SELECT COUNT(*) FROM invoice_lines WHERE source_time_log_id IS NOT NULL
       OR source_case_material_id IS NOT NULL
       OR source_case_other_cost_id IS NOT NULL) AS lines_provenance_set;
`)
console.log('populated:', populated.text)

const post = await q(`
  SELECT 'invoices' AS t, COUNT(*) FROM invoices
  UNION ALL SELECT 'invoice_lines', COUNT(*) FROM invoice_lines;
`)
console.log('post:', post.text)
