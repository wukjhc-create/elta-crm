/**
 * MP-00238 på staging — lagring af per-medarbejder-rettigheder + user_has_permission(). Rigtige sessioner (RPC/REST).
 *   A  bagudkompatibilitet: uden overrides = permissions.ts for alle 5 roller × alle nøgler (0 afvigelser tilladt)
 *   B  overrides: grant tilføjer, revoke fjerner (også rolle-standard), fjernet override genskaber standard, inaktiv og
 *      manglende profil = intet, nulstil til skabelon (manuelle fjernes, skabelonens består)
 *   C  sikkerhed: ingen almindelig bruger (heller ikke admin) kan skrive overrides direkte via REST; læsning = egne + admin
 *   D  funktion: én signatur (00108-versionen væk), fail-closed
 *   npx tsx scripts/test-harness/cli.ts mp-00238-check
 * Midlertidige auth-brugere/rækker ryddes altid.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'
import { PERMISSIONS, hasPermission, type Permission } from '../../src/lib/auth/permissions'
import { PERMISSION_TEMPLATES, templateOverrides } from '../../src/lib/auth/permission-templates'
import type { UserRole } from '../../src/types/auth.types'

export interface M238Check { id: string; ok: boolean; note: string }

export async function runMp00238Check(c: { admin: SupabaseClient; url: string; anonKey: string; sql: (q: string) => Promise<any[]> }): Promise<M238Check[]> {
  const out: M238Check[] = []
  const add = (id: string, ok: boolean, note = '') => out.push({ id, ok, note })
  const KEYS = Object.keys(PERMISSIONS) as Permission[]
  const { loginPersonas } = await import('./role-matrix')
  const p = await loginPersonas({ url: c.url, anonKey: c.anonKey, admin: c.admin })
  const has = async (cl: SupabaseClient, k: string) => {
    const { data, error } = await cl.rpc('user_has_permission', { p_permission: k })
    if (error) throw new Error(`rpc ${k}: ${error.code} ${error.message}`)
    return data === true
  }

  // A — alle roller × alle nøgler
  let diffs = 0
  const per: Record<string, number> = {}
  for (const role of ['admin', 'serviceleder', 'montør', 'salg', 'bogholderi']) {
    const cl = p.get(role as never)!
    let d = 0
    for (const k of KEYS) if ((await has(cl, k)) !== hasPermission(role as UserRole, k)) d++
    per[role] = d
    diffs += d
  }
  add(`A bagudkompatibilitet: 5 roller × ${KEYS.length} nøgler = permissions.ts`, diffs === 0, `afvigelser=${JSON.stringify(per)}`)
  const cat = (await c.sql(`SELECT (SELECT count(*)::int FROM permission_catalog) k, (SELECT count(*)::int FROM role_permission_defaults) d`))[0]
  add('A seed: 112 nøgler / 267 rolle-par', cat.k === KEYS.length && cat.d === 267, `katalog=${cat.k} standarder=${cat.d}`)

  // B — midlertidig montør
  const stamp = Date.now()
  const email = `b238-${stamp}@harness.test`, password = `B238!${randomBytes(12).toString('base64url')}`
  const { data: u, error: uErr } = await c.admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (uErr || !u.user) throw new Error(`createUser: ${uErr?.message}`)
  const uid = u.user.id
  try {
    await c.admin.from('profiles').upsert([{ id: uid, role: 'montør', is_active: true, full_name: '[HARNESS] b238' }], { onConflict: 'id' })
    const cl = createClient(c.url, c.anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const { error: sErr } = await cl.auth.signInWithPassword({ email, password })
    if (sErr) throw new Error(`login: ${sErr.message}`)
    const ov = (permission: string, effect: 'grant' | 'revoke', source: 'manual' | 'template' = 'manual') => c.admin.from('user_permission_overrides').insert({ profile_id: uid, permission, effect, source, reason: 'harness b238' })
    add('B udgangspunkt: montør uden customers.create, med materials.view', !(await has(cl, 'customers.create')) && (await has(cl, 'materials.view')))
    await ov('customers.create', 'grant')
    add('B grant tilføjer nøgle', await has(cl, 'customers.create'))
    await ov('materials.view', 'revoke')
    add('B revoke fjerner rolle-standard', !(await has(cl, 'materials.view')))
    await c.admin.from('user_permission_overrides').delete().eq('profile_id', uid).eq('permission', 'materials.view')
    add('B fjernet override genskaber standard', await has(cl, 'materials.view'))
    const ukendt = await c.admin.from('user_permission_overrides').insert({ profile_id: uid, permission: 'findes.ikke', effect: 'grant' })
    add('B ukendt nøgle afvises (FK til kataloget)', !!ukendt.error, ukendt.error?.code ?? 'indsat')

    // nulstil til skabelon (Elektriker): skabelonens overrides består, manuelle fjernes
    await c.admin.from('user_permission_overrides').delete().eq('profile_id', uid)
    for (const o of templateOverrides(PERMISSION_TEMPLATES.elektriker)) await ov(o.permission, o.effect, 'template')
    await ov('calendar.plan', 'grant')
    add('B skabelon + manuel afvigelse virker', (await has(cl, 'cases.create')) && (await has(cl, 'calendar.plan')))
    await c.admin.from('user_permission_overrides').delete().eq('profile_id', uid).eq('source', 'manual')
    const expectEl = ['customers.create', 'cases.create', 'cases.edit.own']
    add('B nulstil til skabelon: skabelonens nøgler består, manuel fjernet', (await Promise.all(expectEl.map((k) => has(cl, k)))).every(Boolean) && !(await has(cl, 'calendar.plan')))

    // C — REST-skrivning afvises for alle brugere (også admin og ejeren selv)
    const writers: Array<[string, SupabaseClient]> = [['ejer (montør)', cl], ['admin', p.get('admin' as never)!], ['serviceleder', p.get('serviceleder' as never)!]]
    const rest: Record<string, string> = {}
    for (const [label, w] of writers) {
      const ins = await w.from('user_permission_overrides').insert({ profile_id: uid, permission: 'bank.view', effect: 'grant' }).select('profile_id')
      const upd = await w.from('user_permission_overrides').update({ effect: 'revoke' }).eq('profile_id', uid).select('profile_id')
      const del = await w.from('user_permission_overrides').delete().eq('profile_id', uid).select('profile_id')
      const blocked = (r: { error: unknown; data: unknown[] | null }) => !!r.error || (r.data ?? []).length === 0
      rest[label] = blocked(ins) && blocked(upd) && blocked(del) ? 'afvist' : 'TILLADT'
    }
    add('C ingen REST-skrivning af overrides (ejer/admin/serviceleder)', Object.values(rest).every((v) => v === 'afvist'), JSON.stringify(rest))
    const { count: stillThere } = await c.admin.from('user_permission_overrides').select('profile_id', { count: 'exact', head: true }).eq('profile_id', uid)
    add('C rækkerne er urørte efter forsøgene', (stillThere ?? 0) === templateOverrides(PERMISSION_TEMPLATES.elektriker).length, `rækker=${stillThere}`)
    const ownRead = await cl.from('user_permission_overrides').select('permission').eq('profile_id', uid)
    const otherRead = await p.get('salg' as never)!.from('user_permission_overrides').select('permission').eq('profile_id', uid)
    const adminRead = await p.get('admin' as never)!.from('user_permission_overrides').select('permission').eq('profile_id', uid)
    add('C læsning: ejer ser egne, admin ser, andre ser intet', (ownRead.data ?? []).length > 0 && (otherRead.data ?? []).length === 0 && (adminRead.data ?? []).length > 0,
      `ejer=${(ownRead.data ?? []).length} salg=${(otherRead.data ?? []).length} admin=${(adminRead.data ?? []).length}`)

    // inaktiv: alt falsk (også en grant)
    await c.admin.from('profiles').update({ is_active: false }).eq('id', uid)
    add('B/D inaktiv profil: ingen rettigheder (heller ikke grants)', !(await has(cl, 'customers.create')) && !(await has(cl, 'customers.view')))
  } finally {
    await c.admin.from('user_permission_overrides').delete().eq('profile_id', uid)
    await c.admin.from('profiles').delete().eq('id', uid)
    await c.admin.auth.admin.deleteUser(uid).catch(() => {})
  }

  // manglende profil (auth-bruger uden profil)
  const email2 = `b238n-${stamp}@harness.test`, pw2 = `B238!${randomBytes(12).toString('base64url')}`
  const { data: u2 } = await c.admin.auth.admin.createUser({ email: email2, password: pw2, email_confirm: true })
  if (u2?.user) {
    try {
      await c.admin.from('profiles').delete().eq('id', u2.user.id)
      const cl2 = createClient(c.url, c.anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
      await cl2.auth.signInWithPassword({ email: email2, password: pw2 })
      add('B/D manglende profil: ingen rettigheder', !(await has(cl2, 'customers.view')) && !(await has(cl2, 'time.log')))
    } finally {
      await c.admin.auth.admin.deleteUser(u2.user.id).catch(() => {})
    }
  }

  // D — én signatur, anon kan ikke kalde
  const sig = (await c.sql(`SELECT string_agg(pg_get_function_identity_arguments(p.oid), ' | ') s, count(*)::int n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace WHERE ns.nspname='public' AND p.proname='user_has_permission'`))[0]
  add('D én signatur (00108-overload fjernet — ingen tvetydighed)', sig.n === 1 && sig.s === 'p_permission text', String(sig.s))
  const anon = createClient(c.url, c.anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const an = await anon.rpc('user_has_permission', { p_permission: 'customers.view' })
  add('D anon kan ikke kalde funktionen', !!an.error, an.error?.code ?? `værdi=${an.data}`)
  return out
}

export function formatMp00238Check(checks: M238Check[]): string {
  return ['MP-00238 per-medarbejder-rettigheder — staging', ...checks.map((k) => `  ${k.ok ? 'PASS' : 'FAIL'}  ${k.id}${k.note ? ` — ${k.note}` : ''}`),
    `  bestået ${checks.filter((k) => k.ok).length}/${checks.length}`].join('\n')
}
