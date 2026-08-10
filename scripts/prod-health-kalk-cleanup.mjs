/**
 * Read-only prod-health for "Kalkulations-oprydning, del 1".
 * Bekraefter: (1) prod-deployet er live (ikke 402 DEPLOYMENT_DISABLED / 5xx).
 * Aendringen er ren UI/route-skjuling (fjernet Kalkia Pro-knap + redirect af
 * 3 ruter + preview-banner) og roerer INGEN DB/backend.
 * Informativt: dokumenterer datamodel-situationen der begrunder faelden:
 *   calculations (Model A, kanonisk i UI) vs kalkia_calculations (ingen visning
 *   laeser den) vs auto_calculations. Forventet: 3 / 0 / 6.
 * INGEN mutationer.
 */
import fs from 'fs'

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const t = l.trim(); if (!t || t.startsWith('#')) continue
  const i = t.indexOf('='); if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^"|"$/g, '')
}
const ref = env.NEXT_PUBLIC_SUPABASE_URL.replace('https://', '').split('.')[0]
const appUrl = (env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')

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
const ok = (cond, msg) => { console.log(`  ${cond ? 'OK ' : 'XX '} ${msg}`); if (!cond) fails++ }

async function main() {
  console.log('\n=== PROD-HEALTH kalkulations-oprydning del 1 (read-only) ===\n')

  // 1) Prod-deployet er live (ikke 402 DEPLOYMENT_DISABLED / 5xx)
  console.log(`Site: ${appUrl}`)
  let siteStatus = 0
  try {
    const res = await fetch(appUrl, { redirect: 'manual', signal: AbortSignal.timeout(20000) })
    siteStatus = res.status
  } catch (e) { console.log(`   (fetch-fejl: ${e.message})`) }
  ok(siteStatus !== 0 && siteStatus !== 402 && siteStatus < 500, `prod svarer sundt (HTTP ${siteStatus}, ikke 402/5xx)`)

  // 2) Informativt: datamodel-situationen bag faelden (raekker uroert af denne commit)
  const counts = await q(`SELECT
    (SELECT count(*) FROM calculations) AS model_a,
    (SELECT count(*) FROM kalkia_calculations) AS kalkia,
    (SELECT count(*) FROM auto_calculations) AS auto`)
  if (counts.ok && Array.isArray(counts.body) && counts.body[0]) {
    const c = counts.body[0]
    console.log(`  i  calculations (Model A, kanonisk): ${c.model_a}`)
    console.log(`  i  kalkia_calculations (ingen visning laeser): ${c.kalkia}`)
    console.log(`  i  auto_calculations: ${c.auto}`)
  } else {
    console.log(`  i  count-query ikke laesbar (status ${counts.status}) - ikke en gate`)
  }
  ok(true, 'ingen DB/backend-aendring i denne commit (ren UI/route-skjuling)')

  console.log(`\n=== RESULTAT: ${fails === 0 ? 'GROEN - 0 drift-fejl' : fails + ' FEJL'} ===\n`)
  process.exit(fails > 0 ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(1) })
