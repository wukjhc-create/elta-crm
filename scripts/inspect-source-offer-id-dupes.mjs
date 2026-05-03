// Sprint 3D commit 1 — inspect duplicate source_offer_id on service_cases.
// Run BEFORE applying migration 00099 to ensure the unique partial index
// can be created without violating existing data.
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

console.log('Inspecting service_cases for duplicate source_offer_id…\n')

const totalRes = await q(`
  SELECT
    COUNT(*) AS total_cases,
    COUNT(source_offer_id) AS cases_with_source_offer_id,
    COUNT(DISTINCT source_offer_id) AS distinct_source_offer_id
  FROM service_cases;
`)
console.log('Totals:', totalRes.status)
console.log(totalRes.text, '\n')

const dupesRes = await q(`
  SELECT source_offer_id, COUNT(*) AS dup_count
  FROM service_cases
  WHERE source_offer_id IS NOT NULL
  GROUP BY source_offer_id
  HAVING COUNT(*) > 1
  ORDER BY dup_count DESC;
`)
console.log('Duplicates:', dupesRes.status)
console.log(dupesRes.text, '\n')

if (dupesRes.text.includes('"source_offer_id"') && !dupesRes.text.includes('[]')) {
  console.log('❌ STOP: Duplicates found. Do not apply migration until resolved.')
  process.exit(2)
} else {
  console.log('✅ Clean: no duplicates. Safe to add UNIQUE partial index.')
}
