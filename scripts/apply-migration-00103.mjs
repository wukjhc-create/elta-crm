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
  SELECT 'incoming_invoice_lines' AS t, COUNT(*) FROM incoming_invoice_lines
  UNION ALL SELECT 'case_other_costs', COUNT(*) FROM case_other_costs;
`)
console.log('pre:', pre.text)

const sql = fs.readFileSync(
  'supabase/migrations/00103_incoming_invoice_conversion_provenance.sql',
  'utf8'
)
const r = await q(sql)
console.log('apply:', r.status, r.text.substring(0, 800) || '(empty)')
await q("NOTIFY pgrst, 'reload schema';")

const cols = await q(`
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='incoming_invoice_lines'
    AND column_name IN ('converted_case_material_id','converted_case_other_cost_id','converted_at','converted_by')
  ORDER BY ordinal_position;
`)
console.log('iil new cols:', cols.text)

const cocCols = await q(`
  SELECT column_name FROM information_schema.columns
  WHERE table_schema='public' AND table_name='case_other_costs'
    AND column_name='source_incoming_invoice_line_id';
`)
console.log('coc col:', cocCols.text)

const idx = await q(`
  SELECT indexname FROM pg_indexes
  WHERE schemaname='public'
    AND (tablename='incoming_invoice_lines' OR tablename='case_other_costs')
    AND (indexname LIKE '%converted%' OR indexname LIKE '%iil%')
  ORDER BY indexname;
`)
console.log('indexes:', idx.text)

const post = await q(`
  SELECT 'incoming_invoice_lines' AS t, COUNT(*) FROM incoming_invoice_lines
  UNION ALL SELECT 'case_other_costs', COUNT(*) FROM case_other_costs;
`)
console.log('post:', post.text)
