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

console.log('=== PRE-FLIGHT SCHEMA CHECK (read-only, jf. CLAUDE.md) ===')

// 1) solar_products findes + nuværende panel-specs
const panelsPre = await q(
  `SELECT code, specifications FROM solar_products WHERE product_type='panel' ORDER BY sort_order;`,
)
console.log('panels (pre):', panelsPre.status, panelsPre.text)

// 2) update_updated_at_column-funktionen findes (trigger afhænger af den)
const fn = await q(
  `SELECT proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='update_updated_at_column';`,
)
console.log('trigger-funktion findes:', fn.text)

// 3) roof_drawings findes IKKE endnu
const exists = await q(
  `SELECT to_regclass('public.roof_drawings') AS roof_drawings_regclass;`,
)
console.log('roof_drawings (pre, forventes null):', exists.text)

// 4) FK-mål findes (customers, service_cases, profiles)
const fkTargets = await q(
  `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('customers','service_cases','profiles') ORDER BY table_name;`,
)
console.log('FK-mål-tabeller:', fkTargets.text)

console.log('\n=== APPLYING 00153_solar_panel_dimensions.sql ===')
const sql153 = fs.readFileSync('supabase/migrations/00153_solar_panel_dimensions.sql', 'utf8')
const r153 = await q(sql153)
console.log('00153 status:', r153.status)
console.log('00153 body:', r153.text.substring(0, 1000) || '(empty)')

console.log('\n=== APPLYING 00154_roof_drawings.sql ===')
const sql154 = fs.readFileSync('supabase/migrations/00154_roof_drawings.sql', 'utf8')
const r154 = await q(sql154)
console.log('00154 status:', r154.status)
console.log('00154 body:', r154.text.substring(0, 1000) || '(empty)')

await q("NOTIFY pgrst, 'reload schema';")

console.log('\n=== POST-MIGRATION VERIFICATION ===')

const panelsPost = await q(
  `SELECT code, specifications->>'width_mm' AS w, specifications->>'height_mm' AS h FROM solar_products WHERE product_type='panel' ORDER BY sort_order;`,
)
console.log('panels (post — skal have w/h):', panelsPost.text)

const cols = await q(
  `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='roof_drawings' ORDER BY ordinal_position;`,
)
console.log('roof_drawings kolonner:', cols.text)

const rls = await q(
  `SELECT relrowsecurity FROM pg_class WHERE oid='public.roof_drawings'::regclass;`,
)
console.log('roof_drawings RLS aktiveret:', rls.text)

const policies = await q(
  `SELECT polname FROM pg_policy WHERE polrelid='public.roof_drawings'::regclass;`,
)
console.log('roof_drawings policies:', policies.text)

const idx = await q(
  `SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename='roof_drawings' ORDER BY indexname;`,
)
console.log('roof_drawings indexes:', idx.text)

const grants = await q(
  `SELECT grantee, privilege_type FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='roof_drawings' AND grantee IN ('authenticated','anon') ORDER BY grantee, privilege_type;`,
)
console.log('roof_drawings grants:', grants.text)

const rowcount = await q(`SELECT COUNT(*) AS total FROM roof_drawings;`)
console.log('roof_drawings rows (forventes 0):', rowcount.text)
