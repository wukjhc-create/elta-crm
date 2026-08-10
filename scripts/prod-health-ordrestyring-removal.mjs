/**
 * Read-only prod-health for Ordrestyring-fjernelse (Trin 1).
 * Bekræfter: (1) prod-deployet er live, (2) de BEVIDST bevarede DB-kolonner
 * (service_cases/offers os_case_id + os_synced_at) er intakte — dvs. ingen
 * utilsigtet DB-drift, og Trin 2 har noget at fjerne. INGEN mutationer.
 */
import fs from 'fs'

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const t = l.trim(); if (!t || t.startsWith('#')) continue
  const i = t.indexOf('='); if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^"|"$/g, '')
}
const ref = env.NEXT_PUBLIC_SUPABASE_URL.replace('https://', '').split('.')[0]
const appUrl = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')

async function q(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const text = await r.text()
  let body; try { body = JSON.parse(text) } catch { body = text }
  return { ok: r.ok, status: r.status, body }
}

let fails = 0
const ok = (cond, msg) => { console.log(`  ${cond ? '✅' : '❌'} ${msg}`); if (!cond) fails++ }

async function main() {
  console.log('\n=== PROD-HEALTH Ordrestyring-fjernelse (read-only) ===\n')

  // 1) Prod-deployet er live (ikke 402 DEPLOYMENT_DISABLED / 5xx)
  console.log(`Site: ${appUrl}`)
  let siteStatus = 0
  try {
    const res = await fetch(appUrl, { redirect: 'manual', signal: AbortSignal.timeout(20000) })
    siteStatus = res.status
  } catch (e) { console.log(`   (fetch-fejl: ${e.message})`) }
  ok(siteStatus !== 0 && siteStatus !== 402 && siteStatus < 500, `prod svarer sundt (HTTP ${siteStatus}, ikke 402/5xx)`)

  // 2) Bevarede kolonner intakte (Trin 1 rørte ikke DB)
  const cols = await q(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name IN ('service_cases','offers')
      AND column_name IN ('os_case_id','os_synced_at')
    ORDER BY table_name, column_name`)
  const found = cols.ok && Array.isArray(cols.body)
    ? new Set(cols.body.map((r) => `${r.table_name}.${r.column_name}`)) : new Set()
  ok(found.has('service_cases.os_case_id'), 'service_cases.os_case_id bevaret')
  ok(found.has('service_cases.os_synced_at'), 'service_cases.os_synced_at bevaret')
  ok(found.has('offers.os_case_id'), 'offers.os_case_id bevaret')
  ok(found.has('offers.os_synced_at'), 'offers.os_synced_at bevaret')

  // 3) Informativt: hvor mange rækker havde reelt en OS-reference (forventet 0 — integrationen virkede aldrig)
  const used = await q(`
    SELECT
      (SELECT count(*) FROM service_cases WHERE os_case_id IS NOT NULL) AS sc,
      (SELECT count(*) FROM offers WHERE os_case_id IS NOT NULL) AS off`)
  if (used.ok && used.body[0]) {
    console.log(`  ℹ️  rækker med os_case_id: service_cases=${used.body[0].sc}, offers=${used.body[0].off} (forventet 0 — integrationen ramte altid 404)`)
  }

  console.log(`\n=== RESULTAT: ${fails === 0 ? 'GRØN — 0 drift-fejl' : fails + ' FEJL'} ===\n`)
  process.exit(fails > 0 ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(1) })
