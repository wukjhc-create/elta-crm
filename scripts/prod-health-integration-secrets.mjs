/**
 * Read-only prod-health for sikkerheds-deployet (015f1e3):
 *  1. Prod-web svarer (login-siden 200) — deployet er live.
 *  2. Sikkerhedsinvariant: ingen KLARTEKST secrets i `integrations`.
 *     (api_key/api_secret/oauth-secrets skal vaere enc:v1: eller NULL.)
 * Ingen mutationer.
 */
import fs from 'fs'

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const t = l.trim(); if (!t || t.startsWith('#')) continue
  const i = t.indexOf('='); if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim()
}
const ref = env.NEXT_PUBLIC_SUPABASE_URL.replace('https://', '').split('.')[0]
const PROD_URL = 'https://elta-crm.vercel.app'
const ENC_PREFIX = 'enc:v1:'
const SECRET_FIELDS = ['api_key', 'api_secret', 'oauth_client_secret', 'oauth_access_token', 'oauth_refresh_token']

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
const pass = (ok, label, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`); if (!ok) fails++ }

// 1. Prod-web live (login er offentlig → forvent 200).
try {
  const r = await fetch(`${PROD_URL}/login`, { redirect: 'manual' })
  pass(r.status >= 200 && r.status < 400, 'prod-web /login svarer', `HTTP ${r.status}`)
} catch (e) {
  pass(false, 'prod-web /login svarer', String(e))
}

// 2. integrations-tabel findes.
const exists = await q(`SELECT to_regclass('public.integrations') IS NOT NULL AS ok;`)
pass(Array.isArray(exists.body) && exists.body[0]?.ok === true, 'integrations-tabel findes')

// 3. Ingen klartekst i secret-felter (enc:v1: eller NULL). CRITICAL.
const cond = SECRET_FIELDS
  .map((f) => `(${f} IS NOT NULL AND ${f} <> '' AND ${f} NOT LIKE '${ENC_PREFIX}%')`)
  .join(' OR ')
const leak = await q(`SELECT count(*)::int AS n FROM integrations WHERE ${cond};`)
const n = Array.isArray(leak.body) && leak.body[0] ? leak.body[0].n : -1
pass(n === 0, 'ingen klartekst-secrets i integrations', `klartekst-felter=${n}`)

console.log(`\n${fails === 0 ? '0 drift-fejl — prod-health GRØN' : fails + ' drift-fejl'}`)
process.exit(fails === 0 ? 0 : 1)
