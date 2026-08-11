/**
 * Sprint Ø2.2 — smoke-test af login-gate mod prod.
 * Opretter en throwaway auth-bruger, verificerer gaten, og SLETTER brugeren.
 */
import { readFileSync } from 'fs'; import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'

function le(f: string) { try { for (const l of readFileSync(f, 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (!m) continue; const k = m[1]; let v = m[2]; if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); if (!process.env[k]) process.env[k] = v } } catch {} }
le(resolve(__dirname, '..', '.env.local'))

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const BAN = '876000h'

const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })
const newAnon = () => createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })

let pass = 0, fail = 0
const check = (label: string, ok: boolean, detail = '') => { console.log(`  ${ok ? '✅' : '❌'} ${label}${detail ? ' — ' + detail : ''}`); ok ? pass++ : fail++ }

async function signIn(email: string, password: string) {
  const c = newAnon()
  const r = await c.auth.signInWithPassword({ email, password })
  return { c, ok: !r.error && !!r.data.user, err: r.error?.message }
}

async function main() {
  console.log('\n=== Ø2.2 login-gate smoke ===\n')
  const email = `oe22-smoke-${Date.now()}@example.com`
  const password = 'SmokeTest!2026xyz'
  let uid = ''

  try {
    const { data: created, error: cErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    if (cErr || !created?.user) { console.error('createUser failed', cErr); process.exit(1) }
    uid = created.user.id
    await admin.from('profiles').update({ is_active: true, role: 'montør', updated_at: new Date().toISOString() }).eq('id', uid)
    console.log(`testbruger oprettet: ${email}\n`)

    // 1. Aktiv -> login OK
    const s1 = await signIn(email, password)
    check('Aktiv bruger kan logge ind', s1.ok, s1.err)
    await s1.c.auth.signOut()

    // 2. DB-only deaktivering (is_active=false, ingen ban) -> auth lykkes men is_active læses false
    await admin.from('profiles').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', uid)
    const s2 = await signIn(email, password)
    let isActiveSeen: boolean | null = null
    if (s2.ok) {
      const { data: prof } = await s2.c.from('profiles').select('is_active').eq('id', uid).maybeSingle()
      isActiveSeen = prof?.is_active ?? null
      await s2.c.auth.signOut()
    }
    check('DB-only deaktiv: login-form ser is_active=false (signer ud)', s2.ok && isActiveSeen === false, `auth_ok=${s2.ok} is_active=${isActiveSeen}`)

    // 3. Hård ban -> login afvist
    await admin.auth.admin.updateUserById(uid, { ban_duration: BAN })
    const s3 = await signIn(email, password)
    check('Banned/inaktiv bruger kan IKKE logge ind', !s3.ok, s3.err ?? '(ingen fejl — uventet)')

    // 4. Reaktivér (unban + is_active=true) -> login OK
    await admin.auth.admin.updateUserById(uid, { ban_duration: 'none' })
    await admin.from('profiles').update({ is_active: true, updated_at: new Date().toISOString() }).eq('id', uid)
    const s4 = await signIn(email, password)
    check('Reaktiveret bruger kan logge ind igen', s4.ok, s4.err)
    if (s4.ok) await s4.c.auth.signOut()
  } finally {
    if (uid) {
      await admin.auth.admin.deleteUser(uid)
      console.log('\ntestbruger slettet.')
    }
  }

  console.log(`\n=== RESULTAT: ${pass} ✅ / ${fail} ❌ ===\n`)
  if (fail > 0) process.exit(1)
}
main().catch((e) => { console.error(e); process.exit(1) })
