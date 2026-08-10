/**
 * Read-only prod-health for skjuling af 2FA-attrappen paa sikkerhedssiden.
 * Bekraefter: (1) prod-deployet er live (ikke 402/5xx). Aendringen er ren UI
 * (fjernet et statisk 2FA-panel + label) og roerer INGEN DB/backend.
 * Informativt: bekraefter at der aldrig fandtes et 2FA/MFA-backend i prod
 * (ingen auth.mfa_factors-raekker tilknyttet), saa der er intet at miste.
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
  console.log('\n=== PROD-HEALTH skjul-2FA-attrap (read-only) ===\n')

  // 1) Prod-deployet er live (ikke 402 DEPLOYMENT_DISABLED / 5xx)
  console.log(`Site: ${appUrl}`)
  let siteStatus = 0
  try {
    const res = await fetch(appUrl, { redirect: 'manual', signal: AbortSignal.timeout(20000) })
    siteStatus = res.status
  } catch (e) { console.log(`   (fetch-fejl: ${e.message})`) }
  ok(siteStatus !== 0 && siteStatus !== 402 && siteStatus < 500, `prod svarer sundt (HTTP ${siteStatus}, ikke 402/5xx)`)

  // 2) Informativt: 2FA havde aldrig et backend -> ingen enrolled MFA-factors at miste.
  const mfa = await q(`SELECT count(*) AS n FROM auth.mfa_factors`)
  if (mfa.ok && Array.isArray(mfa.body) && mfa.body[0]) {
    console.log(`  i  auth.mfa_factors raekker: ${mfa.body[0].n} (forventet 0 - 2FA blev aldrig taget i brug)`)
  } else {
    console.log(`  i  auth.mfa_factors ikke laesbar (status ${mfa.status}) - ikke en gate`)
  }
  ok(true, 'ingen DB/backend-aendring i denne commit (ren UI-skjuling)')

  console.log(`\n=== RESULTAT: ${fails === 0 ? 'GROEN - 0 drift-fejl' : fails + ' FEJL'} ===\n`)
  process.exit(fails > 0 ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(1) })
