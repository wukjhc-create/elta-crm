/**
 * MP-00240 forudsætninger (app-laget, FØR migrationen) — staging, rigtige sessioner, ingen DB-ændring af schema.
 * Tester scope-motoren (lib/auth/case-scope + customer-scope) mod rigtige FK-relationer og de kontrollerede globale stier:
 *   P  personaer: admin/serviceleder/bogholderi/salg (kunder ALL), montør, Elektriker, Overmontør, inaktiv, manglende profil
 *   K  kunder: egen, relateret via arbejdsordre / sagspart (site) / sagskunde / ÅBEN opgave; afsluttet opgave og annulleret
 *      arbejdsordre giver IKKE adgang; afsluttet opgave fjerner ikke en anden gyldig relation; urelateret skjult
 *   S  sager: egen (created_by), tildelt (assigned_to), via arbejdsordre, annulleret arbejdsordre = skjult, salg D4
 *      (konverteret fra eget tilbud), urelateret skjult
 *   D  dublet: globalt opslag finder en kunde uden for scope; skjult træf mister navnet; kundenummer = globalt max+1
 *   O  tilbud→sag: allerede konverteret til en sag uden for scope → ingen ny sag (created=false, visible=false)
 *   G  fail-closed værn: ukendt sag = afvist; lukket sag = afvist
 * Før 00240 ser brugerklienten alt (RLS true) → testen beviser REGLERNE; 00240-SQL'en testes mod de samme fixtures
 * i mp-00240-sql-probe (rollback-only). Midlertidige brugere/rækker ryddes altid.
 *   npx tsx scripts/test-harness/cli.ts mp-00240-scope-check
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'
import { computeEffectivePermissions } from '../../src/lib/auth/effective-permissions'
import { PERMISSION_TEMPLATES, templateOverrides } from '../../src/lib/auth/permission-templates'
import type { Permission } from '../../src/lib/auth/permissions'

export interface M240Check { id: string; ok: boolean; note: string }

export interface M240Fixtures {
  stamp: number
  m: { uid: string; cl: SupabaseClient; empId: string }
  s: { uid: string; cl: SupabaseClient }
  cust: Record<'own' | 'wo' | 'party' | 'caseCust' | 'task' | 'doneTask' | 'cancelWo' | 'hidden' | 'salgCase', string>
  cases: Record<'own' | 'assigned' | 'wo' | 'cancelWo' | 'hidden' | 'salgD4', string>
  offerId: string
  hiddenEmail: string
}

/** Opretter fixtures (admin-klient). Kaldes også af mp-00240-sql-probe. cleanup() fjerner alt. */
export async function setup240(c: { admin: SupabaseClient; url: string; anonKey: string }): Promise<{ fx: M240Fixtures; cleanup: () => Promise<number> }> {
  const stamp = Date.now()
  let n = 0
  const users: string[] = [], customers: string[] = [], cases: string[] = [], offers: string[] = [], emps: string[] = []
  const adminUid = ((await c.admin.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).limit(1).single()).data as { id: string }).id
  const tempUser = async (role: string) => {
    const email = `m240-${role === 'montør' ? 'montor' : role}-${stamp}-${++n}@harness.test`, password = `M240!${randomBytes(12).toString('base64url')}`
    const { data: u, error } = await c.admin.auth.admin.createUser({ email, password, email_confirm: true })
    if (error || !u.user) throw new Error(`createUser: ${error?.message}`)
    users.push(u.user.id)
    await c.admin.from('profiles').upsert([{ id: u.user.id, role, is_active: true, full_name: `[HARNESS] m240 ${role}` }], { onConflict: 'id' })
    const cl = createClient(c.url, c.anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const { error: sErr } = await cl.auth.signInWithPassword({ email, password })
    if (sErr) throw new Error(`login: ${sErr.message}`)
    return { uid: u.user.id, cl }
  }
  const cleanup = async () => {
    if (users.length) await c.admin.from('user_permission_overrides').delete().in('profile_id', users)
    if (customers.length) await c.admin.from('customer_tasks').delete().in('customer_id', customers)
    if (cases.length) await c.admin.from('work_orders').delete().in('case_id', cases)
    if (customers.length) await c.admin.from('work_orders').delete().in('customer_id', customers)
    if (cases.length) await c.admin.from('service_cases').delete().in('id', cases)
    if (offers.length) await c.admin.from('offers').delete().in('id', offers)
    if (customers.length) await c.admin.from('customers').delete().in('id', customers)
    if (emps.length) await c.admin.from('employees').delete().in('id', emps)
    for (const u of users) {
      await c.admin.from('profiles').delete().eq('id', u)
      await c.admin.auth.admin.deleteUser(u).catch(() => {})
    }
    const { count } = await c.admin.from('customers').select('id', { count: 'exact', head: true }).like('customer_number', `HARN-240-${stamp}-%`)
    return count ?? 0
  }
  try {
    const m = await tempUser('montør')
    const s = await tempUser('salg')
    const { data: emp, error: eErr } = await c.admin.from('employees').insert({ name: `[HARNESS] m240 ${stamp}`, email: `m240-emp-${stamp}@harness.test`, role: 'montør', active: true, hourly_rate: 495, cost_rate: 300, profile_id: m.uid }).select('id').single()
    if (eErr) throw new Error(`employee: ${eErr.message}`)
    emps.push(emp.id)
    const hiddenEmail = `m240-hidden-${stamp}@harness.test`
    const mkCust = async (createdBy: string, email?: string) => {
      const { data, error } = await c.admin.from('customers').insert({ customer_number: `HARN-240-${stamp}-${++n}`, company_name: '[HARNESS] 240', contact_person: 'R', email: email ?? `m240-${stamp}-${n}@harness.test`, created_by: createdBy, custom_fields: { harness: '240' } }).select('id').single()
      if (error) throw new Error(`customer: ${error.message}`)
      customers.push(data.id); return data.id as string
    }
    const mkCase = async (extra: Record<string, unknown>) => {
      const { data, error } = await c.admin.from('service_cases').insert({ title: '[HARNESS] 240', created_by: adminUid, ...extra }).select('id').single()
      if (error) throw new Error(`case: ${error.message}`)
      cases.push(data.id); return data.id as string
    }
    const mkWo = async (caseId: string | null, customerId: string, status: string) => {
      const { error } = await c.admin.from('work_orders').insert({ case_id: caseId, customer_id: customerId, title: '[HARNESS] 240', status, scheduled_date: '2026-10-01', assigned_employee_id: emp.id })
      if (error) throw new Error(`wo: ${error.message}`)
    }
    const mkTask = async (customerId: string, status: string) => {
      const { error } = await c.admin.from('customer_tasks').insert({ customer_id: customerId, title: '[HARNESS] 240', status, assigned_to: m.uid, created_by: adminUid })
      if (error) throw new Error(`task: ${error.message}`)
    }
    const cust = {
      own: await mkCust(m.uid), wo: await mkCust(adminUid), party: await mkCust(adminUid), caseCust: await mkCust(adminUid),
      task: await mkCust(adminUid), doneTask: await mkCust(adminUid), cancelWo: await mkCust(adminUid),
      hidden: await mkCust(adminUid, hiddenEmail), salgCase: await mkCust(adminUid),
    }
    const { data: off, error: oErr } = await c.admin.from('offers').insert({ offer_number: `M240-${stamp}`, title: '[HARNESS] 240', customer_id: cust.salgCase, status: 'accepted', created_by: s.uid }).select('id').single()
    if (oErr) throw new Error(`offer: ${oErr.message}`)
    offers.push(off.id)
    const hiddenOther = await mkCust(adminUid)
    const caseRows = {
      own: await mkCase({ customer_id: hiddenOther, created_by: m.uid }),
      assigned: await mkCase({ customer_id: hiddenOther, assigned_to: m.uid }),
      wo: await mkCase({ customer_id: cust.caseCust, site_customer_id: cust.party }),
      cancelWo: await mkCase({ customer_id: cust.cancelWo }),
      hidden: await mkCase({ customer_id: cust.hidden }),
      salgD4: await mkCase({ customer_id: cust.salgCase, source_offer_id: off.id }),
    }
    await mkWo(caseRows.wo, cust.caseCust, 'planned')
    await mkWo(caseRows.cancelWo, cust.cancelWo, 'cancelled')
    await mkWo(null, cust.wo, 'done') // udført arbejdsordre uden sag: kunden er stadig relateret (historik)
    await mkTask(cust.task, 'pending')
    await mkTask(cust.doneTask, 'done')
    await mkTask(cust.caseCust, 'done') // afsluttet opgave på en kunde der ER relateret via sag → stadig synlig
    // hiddenOther er part på sager der er OWN/ASSIGNED for montøren → den er relateret (sagskunde); ikke en del af 'hidden'
    return { fx: { stamp, m: { ...m, empId: emp.id }, s, cust, cases: caseRows, offerId: off.id, hiddenEmail }, cleanup }
  } catch (e) {
    await cleanup()
    throw e
  }
}

export async function runMp00240ScopeCheck(c: { admin: SupabaseClient; url: string; anonKey: string }): Promise<M240Check[]> {
  const out: M240Check[] = []
  const add = (id: string, ok: boolean, note = '') => out.push({ id, ok, note })
  const { getCaseScope, userCanViewCase } = await import('../../src/lib/auth/case-scope')
  const { getCustomerScope, userCanViewCustomer, filterVisibleCustomerIds } = await import('../../src/lib/auth/customer-scope')
  const { fx, cleanup } = await setup240(c)
  const ctxFor = (role: string, uid: string, cl: SupabaseClient, perms: ReadonlySet<Permission>) =>
    ({ role: role as never, userId: uid, supabase: cl, hasPermission: (p: Permission) => perms.has(p) })
  const eff = (role: string, tpl?: keyof typeof PERMISSION_TEMPLATES) => computeEffectivePermissions(role, tpl ? templateOverrides(PERMISSION_TEMPLATES[tpl]) : [])
  const fixtureCust = Object.values(fx.cust)
  const fixtureCases = Object.values(fx.cases)
  try {
    const { loginPersonas } = await import('./role-matrix')
    const p = await loginPersonas({ url: c.url, anonKey: c.anonKey, admin: c.admin })
    const uidOf = async (cl: SupabaseClient) => (await cl.auth.getUser()).data.user!.id

    // ---- P: ALL-roller
    for (const role of ['admin', 'serviceleder', 'bogholderi', 'salg'] as const) {
      const cl = p.get(role as never)!
      const ctx = ctxFor(role, await uidOf(cl), cl, eff(role))
      const cs = await getCustomerScope(ctx)
      add(`P ${role}: kunder = ALL`, cs.type === 'all' && (await userCanViewCustomer(fx.cust.hidden, ctx)))
      if (role !== 'salg') add(`P ${role}: sager = ALL`, (await getCaseScope(ctx)).type === 'all' && (await userCanViewCase(fx.cases.hidden, ctx)))
    }
    // salg (midlertidig, D4)
    {
      const ctx = ctxFor('salg', fx.s.uid, fx.s.cl, eff('salg'))
      const sc = await getCaseScope(ctx)
      const ids = sc.type === 'all' ? null : new Set(sc.caseIds)
      add('S salg: sag konverteret fra EGET tilbud synlig (D4) — liste + enkeltopslag', !!ids && ids.has(fx.cases.salgD4) && (await userCanViewCase(fx.cases.salgD4, ctx)))
      add('S salg: ikke ALL-sager; urelateret/montørens sager skjult', !!ids && !ids.has(fx.cases.hidden) && !ids.has(fx.cases.own) && !(await userCanViewCase(fx.cases.hidden, ctx)))
    }

    // ---- K/S: montør (rolle uden overrides) og Elektriker (montør + opret-rettigheder) — samme læse-scope
    const expectCust = new Set([fx.cust.own, fx.cust.wo, fx.cust.party, fx.cust.caseCust, fx.cust.task])
    const expectCases = new Set([fx.cases.own, fx.cases.assigned, fx.cases.wo])
    for (const [label, perms] of [['montør', eff('montør')], ['Elektriker', eff('montør', 'elektriker')]] as const) {
      const ctx = ctxFor('montør', fx.m.uid, fx.m.cl, perms)
      const cs = await getCustomerScope(ctx)
      const got = cs.type === 'all' ? null : new Set(cs.customerIds.filter((id) => fixtureCust.includes(id)))
      const want = [...expectCust].sort().join(',')
      add(`K ${label}: kunde-scope = egen + arbejdsordre + sagspart(site) + sagskunde + åben opgave`, !!got && [...got].sort().join(',') === want,
        got ? `mangler=${[...expectCust].filter((x) => !got.has(x)).length} for meget=${[...got].filter((x) => !expectCust.has(x)).length}` : 'ALL (forkert)')
      const single: Record<string, boolean> = {}
      for (const [k, id] of Object.entries(fx.cust)) single[k] = await userCanViewCustomer(id, ctx)
      add(`K ${label}: enkeltopslag = liste (egen/wo/party/sagskunde/åben opgave synlige)`, single.own && single.wo && single.party && single.caseCust && single.task, JSON.stringify(single))
      add(`K ${label}: afsluttet opgave / annulleret arbejdsordre / urelateret / salgs kunde SKJULT`, !single.doneTask && !single.cancelWo && !single.hidden && !single.salgCase)
      const filtered = await filterVisibleCustomerIds(fixtureCust, ctx)
      add(`K ${label}: filterVisibleCustomerIds = scope`, [...filtered].sort().join(',') === want)
      const sc = await getCaseScope(ctx)
      const gotC = sc.type === 'all' ? null : new Set(sc.caseIds.filter((id) => fixtureCases.includes(id)))
      add(`S ${label}: sags-scope = egen + tildelt + arbejdsordre (ikke annulleret, ikke salgs D4, ikke urelateret)`, !!gotC && [...gotC].sort().join(',') === [...expectCases].sort().join(','))
      const one: Record<string, boolean> = {}
      for (const [k, id] of Object.entries(fx.cases)) one[k] = await userCanViewCase(id, ctx)
      add(`S ${label}: enkeltopslag = liste`, one.own && one.assigned && one.wo && !one.cancelWo && !one.hidden && !one.salgD4, JSON.stringify(one))
    }
    // D3: opgaven afsluttes → kunden forsvinder (ingen anden relation)
    {
      const ctx = ctxFor('montør', fx.m.uid, fx.m.cl, eff('montør'))
      await c.admin.from('customer_tasks').update({ status: 'in_progress' }).eq('customer_id', fx.cust.task)
      const inProg = await userCanViewCustomer(fx.cust.task, ctx)
      await c.admin.from('customer_tasks').update({ status: 'done' }).eq('customer_id', fx.cust.task)
      const afterDone = await userCanViewCustomer(fx.cust.task, ctx)
      add('K D3: opgave in_progress = synlig; sat til done = skjult', inProg && !afterDone)
      await c.admin.from('customer_tasks').update({ status: 'pending' }).eq('customer_id', fx.cust.task)
    }
    // Overmontør (skabelon) = ALL/ALL
    {
      const ctx = ctxFor('montør', fx.m.uid, fx.m.cl, eff('montør', 'overmontor'))
      add('P Overmontør-skabelon: kunder ALL + sager ALL', (await getCustomerScope(ctx)).type === 'all' && (await getCaseScope(ctx)).type === 'all')
    }
    // inaktiv / manglende profil (effektivt sæt tomt — ingen_adgang)
    for (const label of ['inaktiv', 'manglende profil']) {
      const ctx = ctxFor('ingen_adgang', fx.m.uid, fx.m.cl, computeEffectivePermissions('ingen_adgang', templateOverrides(PERMISSION_TEMPLATES.overmontor)))
      const cs = await getCustomerScope(ctx), sc = await getCaseScope(ctx)
      add(`P ${label}: ingen kunder/sager (også med skabelon-grants)`, cs.type === 'specific' && cs.customerIds.length === 0 && sc.type === 'specific' && sc.caseIds.length === 0
        && !(await userCanViewCustomer(fx.cust.own, ctx)) && !(await userCanViewCase(fx.cases.own, ctx)))
    }
    // revoke customers.view → ingen kunder (også egen)
    {
      const perms = computeEffectivePermissions('montør', [{ permission: 'customers.view', effect: 'revoke' }])
      const ctx = ctxFor('montør', fx.m.uid, fx.m.cl, perms)
      add('P montør med REVOKE customers.view: ingen kunder', !(await userCanViewCustomer(fx.cust.own, ctx)) && ((await getCustomerScope(ctx)) as { customerIds?: string[] }).customerIds?.length === 0)
      const g = computeEffectivePermissions('montør', [{ permission: 'customers.view.all', effect: 'grant' }])
      add('P montør med GRANT customers.view.all: alle kunder', await userCanViewCustomer(fx.cust.hidden, ctxFor('montør', fx.m.uid, fx.m.cl, g)))
    }

    // ---- D: dublet + kundenummer (kontrollerede globale stier)
    {
      const { findCustomerByEmail } = await import('../../src/lib/customers/customer-email')
      const { nextCustomerNumberGlobal } = await import('../../src/lib/customers/customer-duplicates')
      const hit = await findCustomerByEmail(fx.m.cl, fx.hiddenEmail.toUpperCase())
      add('D dublet: global søgning finder kunden (normaliseret mail)', !!hit && hit.id === fx.cust.hidden)
      // skjult for kalderen: en klient der ikke ser rækken (som efter 00240) → navn fjernes, visible=false
      const hiddenDb = { from: () => { const q: Record<string, unknown> = {}; for (const k of ['select', 'eq', 'neq', 'in', 'is', 'order', 'limit', 'ilike']) q[k] = () => q; q.maybeSingle = async () => ({ data: null, error: null }); return q } }
      const red = await findCustomerByEmail(hiddenDb, fx.hiddenEmail)
      add('D dublet uden for scope: findes, visible=false, intet navn', !!red && red.visible === false && red.company_name === null && !!red.customer_number)
      const { duplicateEmailMessage } = await import('../../src/lib/customers/customer-email')
      add('D dublet-besked uden for scope nævner ikke kundens navn', !!red && !duplicateEmailMessage(fx.hiddenEmail, red).includes('[HARNESS]'))
      const { data: top } = await c.admin.from('customers').select('customer_number').like('customer_number', 'C%').order('customer_number', { ascending: false }).limit(20)
      const max = Math.max(0, ...((top ?? []) as Array<{ customer_number: string }>).map((r) => /^C\d+$/.test(r.customer_number) ? parseInt(r.customer_number.slice(1), 10) : 0))
      const next = await nextCustomerNumberGlobal()
      add('D kundenummer = globalt max+1 (uafhængigt af kalderens scope)', next === `C${String(max + 1).padStart(6, '0')}`, next)
    }

    // ---- O: tilbud→sag når sagen er uden for scope
    {
      const { convertOfferToCase, findCaseForOffer } = await import('../../src/lib/services/offer-to-case')
      const hiddenDb = { from: () => { const q: Record<string, unknown> = {}; for (const k of ['select', 'eq', 'order', 'limit']) q[k] = () => q; q.maybeSingle = async () => ({ data: null, error: null }); return q } }
      const f = await findCaseForOffer(hiddenDb, fx.offerId)
      add('O tilbud allerede konverteret: global sag findes, visible=false for skjult kalder', !!f && f.id === fx.cases.salgD4 && f.visible === false)
      const before = (await c.admin.from('service_cases').select('id', { count: 'exact', head: true }).eq('source_offer_id', fx.offerId)).count
      const r = await convertOfferToCase(hiddenDb, fx.offerId, fx.m.uid)
      const after = (await c.admin.from('service_cases').select('id', { count: 'exact', head: true }).eq('source_offer_id', fx.offerId)).count
      add('O konvertering igen → created=false, visible=false, ingen ny sag', r.success && r.data?.created === false && r.data?.visible === false && before === 1 && after === 1)
      const vis = await findCaseForOffer(fx.s.cl, fx.offerId)
      add('O salgs egen session: sagen er synlig', !!vis && vis.visible === true)
    }

    // ---- G: fail-closed værn
    {
      const { caseWriteBlock, CASE_UNREADABLE_MSG, CASE_CLOSED_MSG } = await import('../../src/lib/cases/case-write-guard')
      const { caseIsClosed } = await import('../../src/lib/cases/cost-row-guards')
      add('G ukendt sag → afvist (ikke "åben")', (await caseWriteBlock('00000000-0000-0000-0000-000000000000')) === CASE_UNREADABLE_MSG
        && (await caseIsClosed(fx.m.cl, '00000000-0000-0000-0000-000000000000')) === true)
      await c.admin.from('service_cases').update({ status: 'closed' }).eq('id', fx.cases.hidden)
      add('G lukket sag → afvist (også når kalderen ikke kan se sagen)', (await caseWriteBlock(fx.cases.hidden)) === CASE_CLOSED_MSG
        && (await caseIsClosed({ from: () => ({}) }, fx.cases.hidden)) === true)
      add('G åben sag → tilladt', (await caseWriteBlock(fx.cases.wo)) === null)
    }
  } catch (e) {
    add('kørsel uden undtagelse', false, e instanceof Error ? e.message : String(e))
  } finally {
    const left = await cleanup()
    out.push({ id: 'oprydning: ingen testkunder tilbage', ok: left === 0, note: `tilbage=${left}` })
  }
  return out
}

export function formatMp00240ScopeCheck(checks: M240Check[]): string {
  return ['MP-00240 forudsætninger — scope-motor + kontrollerede stier (app-laget, staging)',
    ...checks.map((k) => `  ${k.ok ? 'PASS' : 'FAIL'}  ${k.id}${k.note ? ` — ${k.note}` : ''}`),
    `  bestået ${checks.filter((k) => k.ok).length}/${checks.length}`].join('\n')
}
