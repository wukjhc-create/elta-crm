/**
 * Trigger LM FTP/SFTP health check against a running deployment.
 *
 * Usage:
 *   node scripts/test-lm-ftp-health.mjs                # uses NEXT_PUBLIC_APP_URL from .env.local
 *   APP_URL=https://elta.vercel.app node scripts/test-lm-ftp-health.mjs
 *
 * On failure, the endpoint disables the LM credential (is_active=false) so
 * the nightly cron stops attempting LM sync until an operator re-enables it.
 */

import fs from 'fs'

const envFile = fs.readFileSync('.env.local', 'utf8')
const env = {}
for (const line of envFile.split('\n')) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const i = t.indexOf('=')
  if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim()
}

const baseUrl =
  process.env.APP_URL ||
  env.NEXT_PUBLIC_APP_URL ||
  env.APP_URL ||
  'http://localhost:3000'
const secret = process.env.CRON_SECRET || env.CRON_SECRET
if (!secret) {
  console.error('CRON_SECRET missing in env / .env.local')
  process.exit(1)
}

const url = `${baseUrl.replace(/\/$/, '')}/api/admin/test-lm-health`
console.log('GET', url)

const res = await fetch(url, {
  method: 'GET',
  headers: { Authorization: `Bearer ${secret}` },
})
const body = await res.json().catch(() => ({}))
console.log('status:', res.status)
console.log(JSON.stringify(body, null, 2))

if (!res.ok || body.ok === false) {
  console.error('LM HEALTH FAILED — credential has been disabled.')
  process.exit(2)
}
