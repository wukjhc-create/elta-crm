/**
 * MP-00239 på staging — customers + service_cases SKRIVNING følger effektive rettigheder (user_has_permission).
 * Direkte REST med rigtige sessioner:
 *   M  nul overrides: 5 roller × INSERT/UPDATE/DELETE på begge tabeller = forventet matrix (dagens rollesæt, minus
 *      montør i INSERT — beslutning A)
 *   G  én GRANT ad gangen på en montør uden overrides: præcis hvad hver nøgle selvstændigt åbner (7 operationer)
 *   C  montør: baseline nægtet → grant → tilladt → fjernet → nægtet igen (customers.create og cases.create; cases.create
 *      giver ALDRIG sags-UPDATE/-DELETE), offers.create / inbox.view alene giver ingen kunde-INSERT, Elektriker-
 *      skabelon, inaktiv og manglende profil nægtet
 *   S  salg: fjernet customers.edit → UPDATE nægtet · fjernet customers.create/cases.create → opret nægtet
 *   R  efter 00240 (læse-scope): montør ser IKKE en urelateret kunde/sag, men ser dem når en sag tildeles ham; de
 *      øvrige roller ser dem. G/C-fixturerne ligger derfor i montørens scope (tildelt sag / egen kunde), og B-tjekket
 *      viser at en skrive-grant ikke rækker ud over læse-scopet (UPDATE/DELETE kræver at rækken er synlig)
 *   npx tsx scripts/test-harness/cli.ts mp-00239-rls-check
 * Midlertidige auth-brugere, kunder, sager og overrides ryddes altid.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'
import { PERMISSION_TEMPLATES, templateOverrides } from '../../src/lib/auth/permission-templates'

export interface M239Check { id: string; ok: boolean; note: string }

const ROLES = ['admin', 'serviceleder', 'salg', 'montør', 'bogholderi'] as const
// Forventet uden overrides (Henrik 2026-10-26, revideret: hver politik bruger kun handlingens egen rettighed)
const EXPECT: Record<string, readonly string[]> = {
  'customers INSERT': ['admin', 'serviceleder', 'salg'],
  'customers UPDATE': ['admin', 'serviceleder', 'salg'],
  'customers DELETE': ['admin'],
  'service_cases INSERT': ['admin', 'serviceleder', 'salg'],
  'service_cases UPDATE': ['admin', 'serviceleder'],
  'service_cases DELETE (sag)': ['admin'],
  'service_cases DELETE (forslag)': ['admin'],
}
const OPS = ['kunde INSERT', 'kunde UPDATE', 'kunde DELETE', 'sag INSERT', 'sag UPDATE', 'sag DELETE', 'forslag DELETE'] as const
// Hvad hver GRANT selvstændigt åbner (montør-grundrollen har ingen af operationerne)
const GRANTS: Record<string, readonly (typeof OPS)[number][]> = {
  'customers.create': ['kunde INSERT'],
  'customers.edit': ['kunde UPDATE'],
  'customers.delete': ['kunde DELETE'],
  'cases.create': ['sag INSERT'],
  'cases.edit': ['sag UPDATE'],
  'cases.close': ['sag UPDATE'],
  'service.close': ['sag UPDATE'],
  'cases.delete': ['sag DELETE', 'forslag DELETE'],
  'offers.create': [],
  'inbox.view': [],
}

export async function runMp00239RlsCheck(c: { admin: SupabaseClient; url: string; anonKey: string }): Promise<M239Check[]> {
  const out: M239Check[] = []
  const add = (id: string, ok: boolean, note = '') => out.push({ id, ok, note })
  const stamp = Date.now()
  let n = 0
  const customers: string[] = [], cases: string[] = [], users: string[] = []
  const adminUid = ((await c.admin.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).limit(1).single()).data as { id: string }).id

  const custPayload = (uid: string) => { const k = ++n; return { customer_number: `HARN-239-${stamp}-${k}`, company_name: '[HARNESS] 239', contact_person: 'R', email: `m239-${stamp}-${k}@harness.test`, created_by: uid, custom_fields: { harness: '239' } } }
  const seedCustomer = async (owner = adminUid) => {
    const { data, error } = await c.admin.from('customers').insert(custPayload(owner)).select('id').single()
    if (error) throw new Error(`seed customer: ${error.message}`)
    customers.push(data.id); return data.id as string
  }
  const seedCase = async (customerId: string, isProposal: boolean, assignee: string | null = null) => {
    const { data, error } = await c.admin.from('service_cases').insert({ title: '[HARNESS] 239', customer_id: customerId, created_by: adminUid, is_proposal: isProposal, assigned_to: assignee }).select('id').single()
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

    // ---- R: læse-scope (00240) — urelateret kunde/sag: montør ser intet, de øvrige ser dem; tildelt sag → montør ser
    const rCust = await seedCustomer()
    await seedCase(rCust, false)
    const seenRows = async () => {
      const seen: Record<string, string> = {}
      for (const role of ROLES) {
        const cl = p.get(role as never)!
        const a = await cl.from('customers').select('id').eq('id', rCust)
        const b = await cl.from('service_cases').select('id').eq('customer_id', rCust)
        seen[role] = `${(a.data ?? []).length}/${(b.data ?? []).length}`
      }
      return seen
    }
    const seen = await seenRows()
    // salg: kunder ALL (customers.view.all), sager kun OWN/RELATED → ser kunden, ikke den urelaterede sag
    const wantR: Record<string, string> = { admin: '1/1', serviceleder: '1/1', salg: '1/0', 'montør': '0/0', bogholderi: '1/1' }
    add('R urelateret: montør 0/0, salg 1/0 (kunde ja, sag nej), øvrige 1/1', Object.entries(seen).every(([r, v]) => v === wantR[r]), JSON.stringify(seen))
    await seedCase(rCust, false, personaUids[ROLES.indexOf('montør')])
    const seen2 = await seenRows()
    add('R sag tildelt montør → montør ser kunden og (kun) den tildelte sag', seen2['montør'] === '1/1' && seen2['admin'] === '1/2', JSON.stringify(seen2))

    // ---- G: én GRANT ad gangen
    // Fixturerne ligger i montørens læse-scope: base-kunden via en sag tildelt ham, slet-kunden er hans egen, sagerne er
    // tildelt ham — ellers ville UPDATE/DELETE ramme 0 rækker uanset grant (00240)
    const runOps = async (cl: SupabaseClient, uid: string) => {
      const r: string[] = []
      if (await insCustomer(cl, uid)) r.push('kunde INSERT')
      if (await updCustomer(cl, base)) r.push('kunde UPDATE')
      if (await delCustomer(cl, await seedCustomer(uid))) r.push('kunde DELETE')
      if (await insCase(cl, uid, base)) r.push('sag INSERT')
      if (await updCase(cl, await seedCase(base, false, uid))) r.push('sag UPDATE')
      if (await delCase(cl, await seedCase(base, false, uid))) r.push('sag DELETE')
      if (await delCase(cl, await seedCase(base, true, uid))) r.push('forslag DELETE')
      return r
    }
    const g = await tempUser('montør')
    await seedCase(base, false, g.uid)
    const gBase = await runOps(g.cl, g.uid)
    add('G montør uden overrides: ingen af de 7 operationer', gBase.length === 0, `faktisk: ${gBase.join(', ') || '(ingen)'}`)
    for (const [key, want] of Object.entries(GRANTS)) {
      await ov(g.uid, key, 'grant')
      const got = await runOps(g.cl, g.uid)
      await unov(g.uid, key)
      add(`G grant ${key} → ${want.join(', ') || '(intet)'}`, got.length === want.length && want.every((o) => got.includes(o)), `faktisk: ${got.join(', ') || '(intet)'}`)
    }
    const gAfter = await runOps(g.cl, g.uid)
    add('G alle grants fjernet → ingen operationer igen', gAfter.length === 0, `faktisk: ${gAfter.join(', ') || '(ingen)'}`)

    // ---- B: en skrive-grant rækker ikke ud over læse-scopet (urelateret kunde/sag: 0 rækker)
    const outCust = await seedCustomer()
    await ov(g.uid, 'customers.edit', 'grant'); await ov(g.uid, 'customers.delete', 'grant')
    await ov(g.uid, 'cases.edit', 'grant'); await ov(g.uid, 'cases.delete', 'grant')
    add('B grant customers.edit/delete → urelateret kunde: ret/slet NÆGTET', !(await updCustomer(g.cl, outCust)) && !(await delCustomer(g.cl, await seedCustomer())))
    add('B grant cases.edit/delete → urelateret sag: ret/slet NÆGTET', !(await updCase(g.cl, await seedCase(outCust, false))) && !(await delCase(g.cl, await seedCase(outCust, false))))
    add('B … samme grants → egen/tildelt: ret kunde + ret sag TILLADT', (await updCustomer(g.cl, base)) && (await updCase(g.cl, await seedCase(base, false, g.uid))))
    await unov(g.uid)

    // ---- C: montør — de krævede scenarier
    const m = await tempUser('montør')
    await seedCase(base, false, m.uid)
    add('C1 montør baseline: opret kunde NÆGTET', !(await insCustomer(m.cl, m.uid)))
    add('C1 montør baseline: opret / ret / slet sag NÆGTET', !(await insCase(m.cl, m.uid, base)) && !(await updCase(m.cl, await seedCase(base, false, m.uid))) && !(await delCase(m.cl, await seedCase(base, true, m.uid))))
    await ov(m.uid, 'customers.create', 'grant')
    add('C2 grant customers.create → opret kunde TILLADT', await insCustomer(m.cl, m.uid))
    add('C2 … sag stadig NÆGTET (kun den ene nøgle)', !(await insCase(m.cl, m.uid, base)))
    await unov(m.uid, 'customers.create')
    add('C3 grant fjernet → opret kunde NÆGTET igen', !(await insCustomer(m.cl, m.uid)))
    await ov(m.uid, 'offers.create', 'grant')
    add('C3b grant offers.create alene → rå REST kunde-INSERT NÆGTET', !(await insCustomer(m.cl, m.uid)))
    await unov(m.uid, 'offers.create')
    await ov(m.uid, 'inbox.view', 'grant')
    add('C3c grant inbox.view alene → rå REST kunde-INSERT NÆGTET', !(await insCustomer(m.cl, m.uid)))
    add('C3c … og sag-INSERT NÆGTET', !(await insCase(m.cl, m.uid, base)))
    await unov(m.uid, 'inbox.view')
    await ov(m.uid, 'cases.create', 'grant')
    add('C4 grant cases.create → opret sag TILLADT', await insCase(m.cl, m.uid, base))
    add('C4 … ret sag stadig NÆGTET', !(await updCase(m.cl, await seedCase(base, false, m.uid))))
    add('C4 … ret sag-forslag stadig NÆGTET', !(await updCase(m.cl, await seedCase(base, true, m.uid))))
    add('C4 … slet forslag stadig NÆGTET', !(await delCase(m.cl, await seedCase(base, true, m.uid))))
    add('C4 … slet sag stadig NÆGTET', !(await delCase(m.cl, await seedCase(base, false, m.uid))))
    add('C4 … kunde stadig NÆGTET', !(await insCustomer(m.cl, m.uid)))
    await unov(m.uid, 'cases.create')
    add('C5 grant fjernet → opret sag NÆGTET igen', !(await insCase(m.cl, m.uid, base)))
    for (const o of templateOverrides(PERMISSION_TEMPLATES.elektriker)) await ov(m.uid, o.permission, o.effect, 'template')
    add('C6 Elektriker-skabelon → opret kunde TILLADT', await insCustomer(m.cl, m.uid))
    add('C6 Elektriker-skabelon → opret sag TILLADT', await insCase(m.cl, m.uid, base))
    add('C6 Elektriker-skabelon → ret/slet kunde NÆGTET', !(await updCustomer(m.cl, base)) && !(await delCustomer(m.cl, await seedCustomer(m.uid))))
    add('C6 Elektriker-skabelon → ret sag / slet forslag NÆGTET', !(await updCase(m.cl, await seedCase(base, false, m.uid))) && !(await delCase(m.cl, await seedCase(base, true, m.uid))))
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
    const sa = await tempUser('salg')
    add('S0 salg baseline: opret/ret kunde + opret sag TILLADT', (await insCustomer(sa.cl, sa.uid)) && (await updCustomer(sa.cl, base)) && (await insCase(sa.cl, sa.uid, base)))
    add('S0 salg baseline: ret sag / slet forslag NÆGTET (ingen cases.edit/cases.delete)', !(await updCase(sa.cl, await seedCase(base, false))) && !(await delCase(sa.cl, await seedCase(base, true))))
    await ov(sa.uid, 'customers.edit', 'revoke')
    add('S1 revoke customers.edit → ret kunde NÆGTET', !(await updCustomer(sa.cl, base)))
    await unov(sa.uid)
    await ov(sa.uid, 'customers.create', 'revoke')
    add('S2 revoke customers.create → opret kunde NÆGTET (offers.create åbner ikke)', !(await insCustomer(sa.cl, sa.uid)))
    await unov(sa.uid)
    await ov(sa.uid, 'cases.create', 'revoke')
    add('S3 revoke cases.create → opret sag NÆGTET', !(await insCase(sa.cl, sa.uid, base)))
    await unov(sa.uid)
    add('S4 overrides fjernet → salg som før', (await updCustomer(sa.cl, base)) && (await insCase(sa.cl, sa.uid, base)))
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
