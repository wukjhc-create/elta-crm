/**
 * Self-contained LM SFTP health check (does NOT need the deployed Next.js app).
 *
 * - Reads supplier_credentials via Supabase Management API.
 * - Decrypts AES-256-GCM with ENCRYPTION_KEY from .env.local.
 * - Tests SSH/SFTP via ssh2.
 * - On success: marks last_test_status='success'.
 * - On failure: logs, marks last_test_status='failed' + last_test_error,
 *   AND sets is_active=false on the credential row.
 */
import fs from 'fs'
import { Client } from 'ssh2'
import { webcrypto as crypto } from 'crypto'

const envFile = fs.readFileSync('.env.local', 'utf8')
const env = {}
for (const line of envFile.split('\n')) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const i = t.indexOf('=')
  if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim()
}
const ref = env.NEXT_PUBLIC_SUPABASE_URL.replace('https://', '').split('.')[0]
const SB_TOKEN = env.SUPABASE_ACCESS_TOKEN
const ENCRYPTION_KEY = env.ENCRYPTION_KEY
if (!SB_TOKEN || !ENCRYPTION_KEY) {
  console.error('Missing SUPABASE_ACCESS_TOKEN or ENCRYPTION_KEY')
  process.exit(1)
}

async function q(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SB_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const text = await r.text()
  try { return { status: r.status, body: JSON.parse(text) } } catch { return { status: r.status, body: text } }
}

async function decrypt(b64) {
  const keyBuf = Buffer.from(ENCRYPTION_KEY, 'base64')
  const key = await crypto.subtle.importKey('raw', keyBuf, { name: 'AES-GCM', length: 256 }, false, ['decrypt'])
  const combined = Buffer.from(b64, 'base64')
  const iv = combined.subarray(0, 12)
  const ct = combined.subarray(12)
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, ct)
  return new TextDecoder().decode(pt)
}

// 1) locate LM credential
const sup = await q(`SELECT id, code FROM suppliers WHERE UPPER(code)='LM' LIMIT 1;`)
const supplier = sup.body?.[0]
if (!supplier) { console.error('LM supplier not found'); process.exit(1) }

const cr = await q(`SELECT id, credentials_encrypted, api_endpoint, is_active FROM supplier_credentials WHERE supplier_id='${supplier.id}'::uuid AND credential_type='ftp' LIMIT 1;`)
const cred = cr.body?.[0]
if (!cred) { console.error('LM ftp credential not found'); process.exit(1) }

console.log('LM credential id:', cred.id, 'is_active:', cred.is_active)

// 2) decrypt
let creds
try {
  creds = JSON.parse(await decrypt(cred.credentials_encrypted))
} catch (e) {
  console.error('Decryption failed:', e.message)
  process.exit(1)
}

let host = cred.api_endpoint || creds.host || ''
let port = 22
if (host.includes(':')) { const [h,p] = host.split(':'); host=h; const pp=parseInt(p,10); if(!isNaN(pp)) port=pp }
const username = creds.username || ''
const password = creds.password || ''
console.log('host:', host, 'port:', port, 'user:', username)

if (!host || !username || !password) {
  console.error('Missing host/user/password')
  process.exit(1)
}

// 3) test SSH/SFTP connect
function testSsh() {
  return new Promise((resolve) => {
    const conn = new Client()
    const timeout = setTimeout(() => { conn.end(); resolve({ success: false, error: 'Connection timeout (15s)' }) }, 15000)
    conn.on('ready', () => {
      clearTimeout(timeout)
      conn.sftp((err, sftp) => {
        if (err) { conn.end(); return resolve({ success: false, error: 'SFTP channel: ' + err.message }) }
        sftp.readdir('.', (e2) => {
          conn.end()
          resolve(e2 ? { success: false, error: 'readdir: ' + e2.message } : { success: true })
        })
      })
    })
    conn.on('error', (e) => { clearTimeout(timeout); resolve({ success: false, error: e.message }) })
    conn.connect({ host, port, username, password, readyTimeout: 15000, tryKeyboard: true })
    conn.on('keyboard-interactive', (_n, _i, _l, _p, finish) => finish([password]))
  })
}

const result = await testSsh()
const nowIso = new Date().toISOString()

if (result.success) {
  await q(`UPDATE supplier_credentials SET last_test_at='${nowIso}', last_test_status='success', last_test_error=NULL WHERE id='${cred.id}'::uuid;`)
  console.log('LM HEALTH OK')
  process.exit(0)
}

const errMsg = (result.error || 'Unknown SFTP failure').replace(/'/g, "''")
console.error('LM HEALTH FAIL:', errMsg)
console.error('→ disabling LM credential (is_active=false)')

const upd = await q(`
  UPDATE supplier_credentials
     SET last_test_at='${nowIso}',
         last_test_status='failed',
         last_test_error='${errMsg}',
         is_active=false
   WHERE id='${cred.id}'::uuid
   RETURNING id, is_active, last_test_status, last_test_error;
`)
console.log('disable result:', upd.body)
process.exit(2)
