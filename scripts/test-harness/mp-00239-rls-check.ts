/**
 * MP-00239 på staging — customers + service_cases SKRIVNING følger effektive rettigheder (user_has_permission).
 * Direkte REST med rigtige sessioner:
 *   M  nul overrides: 5 roller × INSERT/UPDATE/DELETE på begge tabeller = forventet matrix (dagens rollesæt, minus
 *      montør i INSERT — beslutning A)
 *   C  montør: baseline nægtet → grant customers.create tilladt → fjernet nægtet igen (+ cases.create samme mønster),
 *      Elektriker-skabelon tilladt, inaktiv og manglende profil nægtet
 *   S  salg: fjernet customers.edit → UPDATE nægtet · fjernet cases.create → forslag kan ikke slettes
 *   R  SELECT uændret (alle roller ser kunder og sager)
 *   npx tsx scripts/test-harness/cli.ts mp-00239-rls-check
 * Midlertidige auth-brugere, kunder, sager og overrides ryddes altid.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'
import { PERMISSION_TEMPLATES, templateOverrides } from '../../src/lib/auth/permission-templates'

export interface M239Check { id: string; ok: boolean; note: string }

const ROLES = ['admin', 'serviceleder', 'salg', 'montør', 'bogholderi'] as const
// Forventet uden overrides (Henrik 2026-10-26: = prod-rollesæt; montør fjernet fra INSERT; salg UPDATE uændret)
const EXPECT: Record<string, readonly string[]> = {
  'customers INSERT': ['admin', 'serviceleder', 'salg'],
  'customers UPDATE': ['admin', 'serviceleder', 'salg'],
  'customers DELETE': ['admin'],
  'service_cases INSERT': ['admin', 'serviceleder', 'salg'],
  'service_cases UPDATE': ['admin', 'serviceleder', 'salg'],
  'service_cases DELETE (sag)': ['admin'],
  'service_cases DELETE (forslag)': ['admin', 'serviceleder', 'salg'],
}

export async function runMp00239RlsCheck(c: { admin: SupabaseClient; url: string; anonKey: string }): Promise<M239Check[]> {
  const out: M239Check[] = []
  const add = (id: string, ok: boolean, note = '') => out.push({ id, ok, note })
  const stamp = Date.now()
  let n = 0
  const customers: string[] = [], cases: string[] = [], users: string[] = []
  const adminUid = ((await c.admin.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).limit(1).single()).data as { id: string }).id

  const custPayload = (uid: string) => { const k = ++n; return { customer_number: `HARN-239-${stamp}-${k}`, company_name: '[HARNESS] 239', contact_person: 'R', email: `m239-${stamp}-${k}@harness.test`, created_by: uid, custom_fields: { harness: '239' } } }
  const seedCustomer = async () => {
    const { data, error } = await c.admin.from('customers').insert(custPayload(adminUid)).select('id').single()
    if (error) throw new Error(`seed customer: ${error.message}`)
    customers.push(data.id); return data.id as string
  }
  const seedCase = async (customerId: string, isProposal: boolean) => {
    const { data, error } = await c.admin.from('service_cases').insert({ title: '[HARNESS] 239', customer_id: customerId, created_by: adminUid, is_proposal: isProposal }).select('id').single()
    if (error) throw new Error(`seed case: ${error.message}`)
    cases.push(data.id); return data.id as string
  }
  const rowsOk = (r: { error: unknown; data: unknown[] | null }) => !r.error && (r.data ?? []).length === 1

  // operationer — returnerer true = tilladt (rækken blev skrevet), false = nægtet (RLS-fejl eller 0 rækker)
  const insCustomer = async (cl: SupabaseClient, uid: string) => {
    const r = await cl.from('customers').insert(custPayload(uid)).select('id')
    for (const x of (r.data ?? []) as Array<{ id: string }>) customers.push(x.id)
    return rowsOk(r)
  }
  const updCustomer = async (cl: SupabaseClient, id: string) => rowsOk(await cl.from('customers').update({ notes: `[HARNESS] 239 ${++n}` }).eq('id', id).select('id'))
  const delCustomer = async (cl: SupabaseClient, id: string) => rowsOk(await cl.from('customers').delete().eq('id', id).select('id'))
  const insCase = async (cl: SupabaseClient, uid: string, customerId: string) => {
    const r = await cl.from('service_cases').insert({ title: '[HARNESS] 239', customer_id: customerId, created_by: uid }).select('id')
    for (const x of (r.data ?? []) as Array<{ id: string }>) cases.push(x.id)
    return rowsOk(r)
  }
  const updCase = async (cl: SupabaseClient, id: string) => rowsOk(await cl.from('service_cases').update({ description: `[HARNESS] 239 ${++n}` }).eq('id', id).select('id'))
  const delCase = async (cl: SupabaseClient, id: string) => rowsOk(await cl.from('service_cases').delete().eq('id', id).select('id'))

  const tempUser = async (role: string) => {
    const email = `m239-${role === 'montør' ? 'montor' : role}-${stamp}-${++n}@harness.test`, password = `M239!${randomBytes(12).toString('base64url')}`
    const { data: u, error } = await c.admin.auth.admin.createUser({ email, password, email_confirm: true })
    if (error || !u.user) throw new Error(`createUser: ${error?.message}`)
    users.push(u.user.id)
    await c.admin.from('profiles').upsert([{ id: u.user.id, role, is_active: true, full_name: `[HARNESS] m239 ${role}` }], { onConflict: 'id' })
    const cl = createClient(c.url, c.anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const { error: sErr } = await cl.auth.signInWithPassword({ email, password })
    if (sErr) throw new Error(`login: ${sErr.message}`)
    return { uid: u.user.id, cl }
  }
  const ov = async (uid: string, permission: string, effect: 'grant' | 'revoke', source: 'manual' | 'template' = 'manual') => {
    const { error } = await c.admin.from('user_permission_overrides').insert({ profile_id: uid, permission, effect, source, reason: 'harness m239' })
    if (error) throw new Error(`override ${permission}: ${error.message}`)
  }
  const unov = async (uid: string, permission?: string) => {
    let q = c.admin.from('user_permission_overrides').delete().eq('profile_id', uid)
    if (permission) q = q.eq('permission', permission)
    const { error } = await q
    if (error) throw new Error(`fjern override: ${error.message}`)
  }

  try {
    const { loginPersonas } = await import('./role-matrix')
    const p = await loginPersonas({ url: c.url, anonKey: c.anonKey, admin: c.admin })
    const uidOf = async (cl: SupabaseClient) => (await cl.auth.getUser()).data.user!.id

    // ---- M: nul overrides — personaerne må ikke have overrides
    const personaUids = await Promise.all(ROLES.map((r) => uidOf(p.get(r as never)!)))
    const { count: pov } = await c.admin.from('user_permission_overrides').select('profile_id', { count: 'exact', head: true }).in('profile_id', personaUids)
    add('M forudsætning: personaerne har 0 overrides', (pov ?? 0) === 0, `overrides=${pov}`)
    const base = await seedCustomer()
    const got: Record<string, string[]> = Object.fromEntries(Object.keys(EXPECT).map((k) => [k, [] as string[]]))
    for (let i = 0; i < ROLES.length; i++) {
      const role = ROLES[i], cl = p.get(role as never)!, uid = personaUids[i]
      if (await insCustomer(cl, uid)) got['customers INSERT'].push(role)
      if (await updCustomer(cl, base)) got['customers UPDATE'].push(role)
      if (await delCustomer(cl, await seedCustomer())) got['customers DELETE'].push(role)
      if (await insCase(cl, uid, base)) got['service_cases INSERT'].push(role)
      if (await updCase(cl, await seedCase(base, false))) got['service_cases UPDATE'].push(role)
      if (await delCase(cl, await seedCase(base, false))) got['service_cases DELETE (sag)'].push(role)
      if (await delCase(cl, await seedCase(base, true))) got['service_cases DELETE (forslag)'].push(role)
    }
    for (const [k, want] of Object.entries(EXPECT)) {
      const g = got[k]
      add(`M ${k}: ${want.join(', ')}`, g.length === want.length && want.every((r) => g.includes(r)), `faktisk: ${g.join(', ') || '(ingen)'}`)
    }

    // ---- R: SELECT uændret
    const seen: Record<string, string> = {}
    for (const role of ROLES) {
      const cl = p.get(role as never)!
      const a = await cl.from('customers').select('id').eq('id', base)
      const b = await cl.from('service_cases').select('id').eq('customer_id', base).limit(1)
      seen[role] = `${(a.data ?? []).length}/${(b.data ?? []).length}`
    }
    add('R SELECT uændret: alle roller ser kunde og sag', Object.values(seen).every((v) => v === '1/1'), JSON.stringify(seen))

    // ---- C: montør med overrides
    const m = await tempUser('montør')
    add('C1 montør baseline: opret kunde NÆGTET', !(await insCustomer(m.cl, m.uid)))
    add('C1 montør baseline: opret sag NÆGTET', !(await insCase(m.cl, m.uid, base)))
    await ov(m.uid, 'customers.create', 'grant')
    add('C2 grant customers.create → opret kunde TILLADT', await insCustomer(m.cl, m.uid))
    add('C2 … sag stadig NÆGTET (kun den ene nøgle)', !(await insCase(m.cl, m.uid, base)))
    await unov(m.uid, 'customers.create')
    add('C3 grant fjernet → opret kunde NÆGTET igen', !(await insCustomer(m.cl, m.uid)))
    await ov(m.uid, 'cases.create', 'grant')
    add('C4 grant cases.create → opret sag TILLADT', await insCase(m.cl, m.uid, base))
    add('C4 … kunde stadig NÆGTET', !(await insCustomer(m.cl, m.uid)))
    // konsekvens af paritets-mappingen (beslutning B): cases.create giver også UPDATE og sletning af forslag
    const gUpd = await updCase(m.cl, await seedCase(base, false))
    const gDelProp = await delCase(m.cl, await seedCase(base, true))
    const gDelCase = await delCase(m.cl, await seedCase(base, false))
    add('C4 … cases.create: slet almindelig sag NÆGTET (cases.delete kræves)', !gDelCase)
    add('C4 info: cases.create giver også sags-UPDATE + slet forslag (som salg i dag)', true, `update=${gUpd ? 'tilladt' : 'nægtet'} slet-forslag=${gDelProp ? 'tilladt' : 'nægtet'}`)
    await unov(m.uid, 'cases.create')
    add('C5 grant fjernet → opret sag NÆGTET igen', !(await insCase(m.cl, m.uid, base)))
    add('C5 … sags-UPDATE NÆGTET igen', !(await updCase(m.cl, await seedCase(base, false))))
    for (const o of templateOverrides(PERMISSION_TEMPLATES.elektriker)) await ov(m.uid, o.permission, o.effect, 'template')
    add('C6 Elektriker-skabelon → opret kunde TILLADT', await insCustomer(m.cl, m.uid))
    add('C6 Elektriker-skabelon → opret sag TILLADT', await insCase(m.cl, m.uid, base))
    add('C6 Elektriker-skabelon → ret kunde NÆGTET (customers.edit ikke i skabelonen)', !(await updCustomer(m.cl, base)))
    add('C6 Elektriker-skabelon → slet kunde NÆGTET', !(await delCustomer(m.cl, await seedCustomer())))
    await c.admin.from('profiles').update({ is_active: false }).eq('id', m.uid)
    add('C7 inaktiv (med skabelon-grants) → opret kunde NÆGTET', !(await insCustomer(m.cl, m.uid)))
    add('C7 inaktiv (med skabelon-grants) → opret sag NÆGTET', !(await insCase(m.cl, m.uid, base)))

    // manglende profil
    const ghost = await tempUser('montør')
    await unov(ghost.uid)
    await c.admin.from('profiles').delete().eq('id', ghost.uid)
    add('C8 manglende profil → opret kunde NÆGTET', !(await insCustomer(ghost.cl, ghost.uid)))
    add('C8 manglende profil → opret sag NÆGTET', !(await insCase(ghost.cl, ghost.uid, base)))

    // ---- S: salg med fjernet adgang
    const s = await tempUser('salg')
    add('S0 salg baseline: ret kunde + slet forslag TILLADT', (await updCustomer(s.cl, base)) && (await delCase(s.cl, await seedCase(base, true))))
    await ov(s.uid, 'customers.edit', 'revoke')
    add('S1 revoke customers.edit → ret kunde NÆGTET', !(await updCustomer(s.cl, base)))
    await unov(s.uid)
    await ov(s.uid, 'cases.create', 'revoke')
    add('S2 revoke cases.create → slet forslag NÆGTET', !(await delCase(s.cl, await seedCase(base, true))))
    await unov(s.uid)
    add('S3 overrides fjernet → salg som før', (await updCustomer(s.cl, base)) && (await delCase(s.cl, await seedCase(base, true))))
  } finally {
    for (const u of users) await c.admin.from('user_permission_overrides').delete().eq('profile_id', u)
    if (cases.length) await c.admin.from('service_cases').delete().in('id', cases)
    const { data: more } = await c.admin.from('service_cases').select('id').in('customer_id', customers.length ? customers : ['00000000-0000-0000-0000-000000000000'])
    if ((more ?? []).length) await c.admin.from('service_cases').delete().in('id', (more as Array<{ id: string }>).map((x) => x.id))
    if (customers.length) await c.admin.from('customers').delete().in('id', customers)
    for (const u of users) {
      await c.admin.from('profiles').delete().eq('id', u)
      await c.admin.auth.admin.deleteUser(u).catch(() => {})
    }
    const { count: left } = await c.admin.from('customers').select('id', { count: 'exact', head: true }).like('customer_number', `HARN-239-${stamp}-%`)
    out.push({ id: 'oprydning: ingen testkunder tilbage', ok: (left ?? 0) === 0, note: `tilbage=${left}` })
  }
  return out
}

export function formatMp00239RlsCheck(checks: M239Check[]): string {
  return ['MP-00239 customers + service_cases skrivning via effektive rettigheder — staging',
    ...checks.map((k) => `  ${k.ok ? 'PASS' : 'FAIL'}  ${k.id}${k.note ? ` — ${k.note}` : ''}`),
    `  bestået ${checks.filter((k) => k.ok).length}/${checks.length}`].join('\n')
}
