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

const sql = fs.readFileSync('supabase/migrations/00100_case_materials.sql', 'utf8')
const r = await q(sql)
console.log('apply:', r.status, r.text.substring(0, 800) || '(empty)')
await q("NOTIFY pgrst, 'reload schema';")

const v = await q(`
  SELECT column_name, data_type, is_generated, generation_expression
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='case_materials'
  ORDER BY ordinal_position;
`)
console.log('columns:', v.text.substring(0, 2000))

const i = await q(`
  SELECT indexname FROM pg_indexes
  WHERE schemaname='public' AND tablename='case_materials'
  ORDER BY indexname;
`)
console.log('indexes:', i.text)

const p = await q(`
  SELECT polname FROM pg_policy
  WHERE polrelid = 'public.case_materials'::regclass;
`)
console.log('policies:', p.text)
