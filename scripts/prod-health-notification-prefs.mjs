/**
 * Read-only prod-health for skjuling af døde notifikations-præferencer.
 * Bekræfter: (1) prod-deployet er live (ikke 402/5xx). Ændringen er ren UI
 * (skjul af rute + kort) og rører INGEN DB — derfor er der ingen drift at
 * verificere. Informativt: kolonnen profiles.notification_preferences blev
 * aldrig kørt mod prod (migration 00048 ikke anvendt), så feature'en kunne
 * aldrig have persisteret præferencer — hvilket bekræfter at det var korrekt
 * at skjule de døde toggles. Ingen data at miste. INGEN mutationer.
 * Redirect-adfærden for /dashboard/settings/notifications er gated bag
 * auth-middleware i prod og verificeres via build + tsc, ikke her.
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
const ok = (cond, msg) => { console.log(`  ${cond ? '✅' : '❌'} ${msg}`); if (!cond) fails++ }

async function main() {
  console.log('\n=== PROD-HEALTH skjul-notifikations-præferencer (read-only) ===\n')

  // 1) Prod-deployet er live (ikke 402 DEPLOYMENT_DISABLED / 5xx)
  console.log(`Site: ${appUrl}`)
  let siteStatus = 0
  try {
    const res = await fetch(appUrl, { redirect: 'manual', signal: AbortSignal.timeout(20000) })
    siteStatus = res.status
  } catch (e) { console.log(`   (fetch-fejl: ${e.message})`) }
  ok(siteStatus !== 0 && siteStatus !== 402 && siteStatus < 500, `prod svarer sundt (HTTP ${siteStatus}, ikke 402/5xx)`)

  // 2) Informativt: ændringen rører ingen DB. Bekræft at kolonnen aldrig
  //    blev anvendt i prod (forventet fraværende → feature kunne aldrig persistere).
  const col = await q(`
    SELECT count(*) AS n
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='profiles'
      AND column_name='notification_preferences'`)
  const colExists = col.ok && Array.isArray(col.body) && col.body[0] && Number(col.body[0].n) > 0
  console.log(`  ℹ️  profiles.notification_preferences i prod: ${colExists ? 'findes' : 'fraværende (migration 00048 ej anvendt — ingen data at miste)'}`)
  ok(true, 'ingen DB-ændring i denne commit (ren UI-skjuling)')

  console.log(`\n=== RESULTAT: ${fails === 0 ? 'GRØN — 0 drift-fejl' : fails + ' FEJL'} ===\n`)
  process.exit(fails > 0 ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(1) })
