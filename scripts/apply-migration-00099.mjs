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

const sql = fs.readFileSync(
  'supabase/migrations/00099_service_cases_unique_source_offer.sql',
  'utf8'
)
const r = await q(sql)
console.log('apply:', r.status, r.text.substring(0, 600) || '(empty)')
await q("NOTIFY pgrst, 'reload schema';")

const v = await q(`
  SELECT indexname, indexdef
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename = 'service_cases'
    AND indexname IN ('uq_service_cases_source_offer_id', 'idx_service_cases_source_offer')
  ORDER BY indexname;
`)
console.log('verify:', v.text)
