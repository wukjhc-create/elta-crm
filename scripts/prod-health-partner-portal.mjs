/**
 * Read-only prod-health for: partner-portal Fase 1.
 * Bekraefter:
 *  1) Prod-deployet er live (ikke 402 DEPLOYMENT_DISABLED / 5xx).
 *  2) partner_access_tokens findes med de kolonner koden laeser + ingen anon-policy.
 *  3) Ruterne er deployet: /partner/invalid → 200; /api/partner/documents uden
 *     params → 400 (mit kode live; 404 = gammelt deploy).
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
  const text = await r.text(); let body; try { body = JSON.parse(text) } catch { body = text }
  return { ok: r.ok, status: r.status, body }
}
let fails = 0
const ok = (cond, msg) => { console.log(`  ${cond ? 'OK ' : 'XX '} ${msg}`); if (!cond) fails++ }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function pollStatus(url, want, label) {
  let status = 0
  for (let a = 1; a <= 10; a++) {
    try {
      const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(20000) })
      status = res.status
    } catch (e) { console.log(`   (forsoeg ${a} fetch-fejl: ${e.message})`) }
    if (status === want) break
    console.log(`   forsoeg ${a}: ${label} status ${status} (afventer deploy)…`)
    if (a < 10) await sleep(15000)
  }
  return status
}

async function main() {
  console.log('\n=== PROD-HEALTH partner-portal Fase 1 (read-only) ===\n')
  console.log(`Site: ${appUrl}`)

  // 1) prod live
  let siteStatus = 0
  try {
    const res = await fetch(appUrl, { redirect: 'manual', signal: AbortSignal.timeout(20000) })
    siteStatus = res.status
  } catch (e) { console.log(`   (fetch-fejl: ${e.message})`) }
  ok(siteStatus !== 0 && siteStatus !== 402 && siteStatus < 500, `prod svarer sundt (HTTP ${siteStatus}, ikke 402/5xx)`)

  // 2) tabel + kolonner + ingen anon-policy
  const cols = await q(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='partner_access_tokens' ORDER BY column_name`)
  const found = cols.ok && Array.isArray(cols.body) ? cols.body.map((r) => r.column_name) : []
  for (const c of ['partner_customer_id', 'token', 'email', 'is_active', 'expires_at', 'last_accessed_at', 'created_by', 'created_at'])
    ok(found.includes(c), `kolonne findes: partner_access_tokens.${c}`)
  const pol = await q(`SELECT roles::text AS roles FROM pg_policies WHERE tablename='partner_access_tokens'`)
  const roles = pol.ok && Array.isArray(pol.body) ? pol.body.map((r) => r.roles).join(',') : ''
  ok(!/anon/.test(roles), `ingen anon-policy paa partner_access_tokens (roles: ${roles || 'ingen'})`)

  // 3) ruter deployet
  const inv = await pollStatus(`${appUrl}/partner/invalid`, 200, '/partner/invalid')
  ok(inv === 200, `/partner/invalid deployet (200, faktisk ${inv})`)
  const doc = await pollStatus(`${appUrl}/api/partner/documents`, 400, '/api/partner/documents')
  ok(doc === 400, `/api/partner/documents deployet (400 paa manglende params, faktisk ${doc})`)

  console.log(`\n=== ${fails === 0 ? 'ALT GROENT' : fails + ' FEJL'} ===`)
  process.exit(fails === 0 ? 0 : 1)
}
main().catch((e) => { console.error(e); process.exit(1) })
