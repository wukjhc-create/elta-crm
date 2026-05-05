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
  SELECT 'invoices' AS t, COUNT(*) FROM invoices;
`)
console.log('pre:', pre.text)

// ---- Apply 00105 ----
const sql105 = fs.readFileSync(
  'supabase/migrations/00105_invoice_multi_stage.sql',
  'utf8'
)
const r105 = await q(sql105)
console.log('apply 00105:', r105.status, r105.text.substring(0, 600) || '(empty)')

// ---- Apply 00106 ----
const sql106 = fs.readFileSync(
  'supabase/migrations/00106_invoice_predecessors.sql',
  'utf8'
)
const r106 = await q(sql106)
console.log('apply 00106:', r106.status, r106.text.substring(0, 600) || '(empty)')

await q("NOTIFY pgrst, 'reload schema';")

// ---- Verify columns on invoices ----
const cols = await q(`
  SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='invoices'
    AND column_name IN ('invoice_type','billing_percentage','amount_basis',
                        'amount_basis_value','stage_label','is_final_invoice')
  ORDER BY column_name;
`)
console.log('new invoice cols:', cols.text)

// ---- Verify CHECK constraints ----
const checks = await q(`
  SELECT conname, pg_get_constraintdef(oid)
  FROM pg_constraint
  WHERE conrelid='public.invoices'::regclass AND contype='c'
    AND (conname ILIKE '%invoice_type%' OR conname ILIKE '%billing_percentage%'
         OR conname ILIKE '%amount_basis%')
  ORDER BY conname;
`)
console.log('checks:', checks.text)

// ---- Verify indexes ----
const idx = await q(`
  SELECT indexname FROM pg_indexes
  WHERE schemaname='public'
    AND (tablename='invoices' OR tablename='invoice_predecessors')
    AND (indexname LIKE '%final%' OR indexname LIKE '%case_stage%' OR indexname LIKE '%predecessor%')
  ORDER BY indexname;
`)
console.log('indexes:', idx.text)

// ---- Verify FK rules on invoice_predecessors ----
const fk = await q(`
  SELECT conname, pg_get_constraintdef(oid)
  FROM pg_constraint
  WHERE conrelid='public.invoice_predecessors'::regclass AND contype='f'
  ORDER BY conname;
`)
console.log('FKs:', fk.text)

// ---- Verify existing invoice rows have correct defaults ----
const existing = await q(`
  SELECT id, invoice_number, status, invoice_type, amount_basis, is_final_invoice,
         billing_percentage, amount_basis_value, stage_label
  FROM invoices LIMIT 5;
`)
console.log('existing rows:', existing.text)

// ---- Verify invoice_predecessors empty ----
const pre2 = await q(`SELECT COUNT(*) FROM invoice_predecessors;`)
console.log('predecessors count:', pre2.text)

// ---- Confirm RLS + policy on invoice_predecessors ----
const policy = await q(`
  SELECT polname FROM pg_policy
  WHERE polrelid='public.invoice_predecessors'::regclass;
`)
console.log('predecessors policy:', policy.text)

// ---- Final row counts unchanged ----
const post = await q(`SELECT 'invoices' AS t, COUNT(*) FROM invoices;`)
console.log('post:', post.text)
