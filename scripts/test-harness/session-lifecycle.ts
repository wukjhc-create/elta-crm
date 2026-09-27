/**
 * Sessions / invitationer / deaktivering / rolleaendringer (P1 #6) — KUN staging.
 *
 * Bruger egne midlertidige testbrugere (harness-lifecycle-*@harness.test) som slettes igen, saa de delte personaer
 * aldrig deaktiveres. Deaktivering sker med appens EGEN kode (setProfileLoginActive: auth-ban + is_active=false).
 *
 *   L1  signup med rolle i metadata -> profil faar alligevel 'montør' (00150 handle_new_user)
 *   L2  bruger kan ikke selv aendre sin rolle / is_active (prevent_profile_privilege_change)
 *   L3  rolleaendring virker med det samme i en aktiv session (rolle laeses live, ikke fra JWT)
 *   L4  deaktiveret bruger: nyt login afvist
 *   L5  deaktiveret bruger: token-refresh afvist
 *   L6  deaktiveret bruger med STADIG GYLDIGT access-token mister data-adgang med det samme (RLS tjekker is_active)
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'

export interface LifecycleCheck { id: string; ok: boolean; note: string }

export async function runSessionLifecycle(opts: { url: string; anonKey: string; admin: SupabaseClient }): Promise<LifecycleCheck[]> {
  const { admin } = opts
  const out: LifecycleCheck[] = []
  const users: string[] = []
  const cleanup: Array<() => PromiseLike<unknown>> = []
  const stamp = Date.now()
  const newClient = () => createClient(opts.url, opts.anonKey, { auth: { persistSession: false, autoRefreshToken: false } })

  const makeUser = async (tag: string, role: string | null, metadata: Record<string, unknown> = {}) => {
    const email = `harness-lifecycle-${tag}-${stamp}@harness.test`
    const password = `Lc!${randomBytes(12).toString('base64url')}`
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: metadata })
    if (error || !data.user) throw new Error(`createUser ${tag}: ${error?.message}`)
    users.push(data.user.id)
    if (role) {
      const { error: pErr } = await admin.from('profiles').update({ role, is_active: true }).eq('id', data.user.id)
      if (pErr) throw new Error(`rolle ${tag}: ${pErr.message}`)
    }
    return { id: data.user.id, email, password }
  }
  const login = async (email: string, password: string) => {
    const c = newClient()
    const r = await c.auth.signInWithPassword({ email, password })
    return { c, error: r.error, session: r.data.session }
  }

  try {
    // probe-faktura (salg/bogholderi-laesbar), saa "0 raekker" aldrig er vakuoest
    const { data: inv } = await admin.from('invoices').insert([{ invoice_number: `HARNESS-SEC-LC-${stamp}` }]).select('id')
    const invId = (inv?.[0] as { id?: string } | undefined)?.id
    if (!invId) throw new Error('probe-faktura kunne ikke oprettes')
    cleanup.unshift(() => admin.from('invoices').delete().eq('id', invId))
    const seesInvoice = async (c: SupabaseClient) => ((await c.from('invoices').select('id').eq('id', invId)).data ?? []).length === 1

    // L1 signup-metadata kan ikke saette rollen
    const inj = await makeUser('inject', null, { role: 'admin', full_name: 'Injection probe' })
    const injRole = ((await admin.from('profiles').select('role').eq('id', inj.id).maybeSingle()).data as { role?: string } | null)?.role
    out.push({ id: 'L1 signup med role=admin i metadata', ok: injRole === 'montør', note: `profil-rolle=${injRole ?? '(ingen profil)'}` })

    // L2 + L3 med en montør
    const m = await makeUser('role', 'montør')
    const ms = await login(m.email, m.password)
    if (ms.error) throw new Error(`login montør: ${ms.error.message}`)
    const esc = await ms.c.from('profiles').update({ role: 'admin' }).eq('id', m.id).select('role')
    const roleAfter = ((await admin.from('profiles').select('role').eq('id', m.id).maybeSingle()).data as { role?: string } | null)?.role
    out.push({ id: 'L2 bruger saetter egen rolle til admin', ok: roleAfter === 'montør', note: esc.error ? `afvist (${esc.error.message.slice(0, 50)})` : `rolle efter forsoeg=${roleAfter}` })
    const deact = await ms.c.from('profiles').update({ is_active: false }).eq('id', m.id).select('id')
    const activeAfter = ((await admin.from('profiles').select('is_active').eq('id', m.id).maybeSingle()).data as { is_active?: boolean } | null)?.is_active
    out.push({ id: 'L2 bruger aendrer egen is_active', ok: activeAfter === true, note: deact.error ? `afvist (${deact.error.message.slice(0, 50)})` : `is_active efter forsoeg=${activeAfter}` })

    const before = await seesInvoice(ms.c)
    await admin.from('profiles').update({ role: 'bogholderi' }).eq('id', m.id)
    const promoted = await seesInvoice(ms.c)
    await admin.from('profiles').update({ role: 'montør' }).eq('id', m.id)
    const demoted = await seesInvoice(ms.c)
    out.push({ id: 'L3 rolleaendring i aktiv session', ok: !before && promoted && !demoted, note: `montør=${before ? 'ser' : 'ser ikke'} → bogholderi=${promoted ? 'ser' : 'ser IKKE'} → montør=${demoted ? 'SER STADIG' : 'ser ikke'} (samme token)` })

    // L4–L6 deaktivering via appens egen kode
    const b = await makeUser('deact', 'bogholderi')
    const bs = await login(b.email, b.password)
    if (bs.error || !bs.session) throw new Error(`login bogholderi: ${bs.error?.message}`)
    const activeBefore = await seesInvoice(bs.c)
    const { setProfileLoginActive } = await import('../../src/lib/auth/login-access')
    const res = await setProfileLoginActive(b.id, false)
    if (!res.ok) throw new Error(`deaktivering: ${res.error}`)
    const relogin = await login(b.email, b.password)
    out.push({ id: 'L4 deaktiveret: nyt login', ok: !!relogin.error, note: relogin.error ? `afvist (${relogin.error.message.slice(0, 40)})` : 'LOGGEDE IND' })
    const refresh = await bs.c.auth.refreshSession({ refresh_token: bs.session.refresh_token })
    out.push({ id: 'L5 deaktiveret: token-refresh', ok: !!refresh.error, note: refresh.error ? `afvist (${refresh.error.message.slice(0, 40)})` : 'NY TOKEN UDSTEDT' })
    const after = await bs.c.from('invoices').select('id').eq('id', invId)
    const stillSees = (after.data ?? []).length === 1
    // Aarsagen skal vaere kendt og aegte (ikke en tilfaeldig fejl): Supabase-ban tilbagekalder sessionen, og PostgREST
    // afviser tokenet (401/JWT-fejl) - eller RLS giver 0 raekker. Begge er afvisning; en anden fejl er IKKE.
    const reason = after.error ? `${after.error.code ?? ''} ${after.error.message}`.trim().slice(0, 60) : stillSees ? '' : '0 raekker (RLS)'
    // Mekanisme (verificeret 2026-09-27): efter auth-ban behandler Supabase det stadig gyldige token som anon -> ingen
    // authenticated-policies gaelder. Bevis: kald af user_role (kun authenticated har EXECUTE, 00162) afvises.
    const asRole = await bs.c.rpc('user_role', { p_user_id: b.id })
    const downgraded = !!asRole.error && /permission denied/i.test(asRole.error.message)
    out.push({ id: 'L6 deaktiveret med gyldigt access-token', ok: activeBefore && !stillSees && downgraded,
      note: `foer=${activeBefore ? 'ser faktura' : 'ser ikke'} · efter (samme token)=${stillSees ? 'SER STADIG FAKTURA' : `afvist (${reason})`} · token behandles som ${downgraded ? 'anon' : 'AUTHENTICATED'}` })
  } finally {
    for (const c of cleanup) await c()
    for (const id of users) {
      await admin.from('profiles').delete().eq('id', id)
      await admin.auth.admin.deleteUser(id)
    }
  }
  return out
}

export function formatLifecycle(c: LifecycleCheck[]): string {
  const bad = c.filter((x) => !x.ok).length
  return ['', 'SESSIONS / DEAKTIVERING / ROLLEAENDRING:', ...c.map((x) => `  ${x.ok ? '✓' : '❌'} ${x.id.padEnd(44)} ${x.note}`),
    bad ? `  ❌ ${bad} afvigelse(r)` : `  ✅ alle ${c.length} livscyklus-checks som forventet`].join('\n')
}
