/** Read-only prod-health for roof-drawing-modulet. Ingen skrivninger. */
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
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  return JSON.parse(await r.text())
}
let fail = 0
const ok = (c, m) => { console.log(`${c ? '✓' : '✗ FEJL'} ${m}`); if (!c) fail++ }

const panels = await q(`SELECT code, specifications->>'width_mm' AS w, specifications->>'height_mm' AS h FROM solar_products WHERE product_type='panel' ORDER BY sort_order;`)
ok(panels.length === 3 && panels.every((p) => p.w && p.h), `panel-mål sat på ${panels.length} paneler: ${panels.map((p) => `${p.code} ${p.w}×${p.h}`).join(', ')}`)

const tbl = await q(`SELECT to_regclass('public.roof_drawings') AS t;`)
ok(tbl[0]?.t === 'roof_drawings', 'roof_drawings findes')

const rls = await q(`SELECT relrowsecurity FROM pg_class WHERE oid='public.roof_drawings'::regclass;`)
ok(rls[0]?.relrowsecurity === true, 'RLS aktiveret')

const pol = await q(`SELECT polname, polroles::regrole[] AS roles FROM pg_policy WHERE polrelid='public.roof_drawings'::regclass;`)
ok(pol.length === 1 && JSON.stringify(pol[0].roles).includes('authenticated'), `policy kun for authenticated (${pol.length} policy)`)
ok(!JSON.stringify(pol).includes('anon'), 'ingen anon-policy (anon reelt blokeret trods table-grant)')

const idx = await q(`SELECT COUNT(*) AS n FROM pg_indexes WHERE schemaname='public' AND tablename='roof_drawings';`)
ok(Number(idx[0]?.n) >= 3, `indexes til stede (${idx[0]?.n})`)

const rows = await q(`SELECT COUNT(*) AS n FROM roof_drawings;`)
ok(Number(rows[0]?.n) === 0, `0 rækker (ingen test-drift) — ${rows[0]?.n}`)

console.log(`\n${fail === 0 ? '✅ PROD-HEALTH GRØN' : `❌ ${fail} fejl`}`)
process.exit(fail === 0 ? 0 : 1)
