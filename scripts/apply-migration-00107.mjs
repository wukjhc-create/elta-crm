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

const pre = await q(`SELECT 'invoices' AS t, COUNT(*) FROM invoices;`)
console.log('pre:', pre.text)

const sql = fs.readFileSync('supabase/migrations/00107_invoice_credit_note.sql', 'utf8')
const r = await q(sql)
console.log('apply:', r.status, r.text.substring(0, 800) || '(empty)')
await q("NOTIFY pgrst, 'reload schema';")

const cols = await q(`
  SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='invoices'
    AND column_name IN ('credit_of_invoice_id','credit_reason','voided_at','voided_by')
  ORDER BY column_name;
`)
console.log('new cols:', cols.text)

const fks = await q(`
  SELECT conname, pg_get_constraintdef(oid)
  FROM pg_constraint
  WHERE conrelid='public.invoices'::regclass AND contype='f'
    AND (conname LIKE '%credit_of%' OR conname LIKE '%voided_by%')
  ORDER BY conname;
`)
console.log('FKs:', fks.text)

const idx = await q(`
  SELECT indexname FROM pg_indexes
  WHERE schemaname='public' AND tablename='invoices'
    AND (indexname LIKE '%credit%' OR indexname LIKE '%voided%')
  ORDER BY indexname;
`)
console.log('indexes:', idx.text)

const existing = await q(`
  SELECT id, invoice_number, status, invoice_type,
         credit_of_invoice_id, credit_reason, voided_at, voided_by
  FROM invoices LIMIT 5;
`)
console.log('existing rows:', existing.text)

const post = await q(`SELECT COUNT(*) FROM invoices;`)
console.log('post row count:', post.text)
