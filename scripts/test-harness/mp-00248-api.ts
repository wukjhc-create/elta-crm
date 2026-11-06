/**
 * 00248 med RIGTIGE persona-klienter mod STAGING (kræver at 00248 er anvendt): PostgREST som brugeren selv ville kalde
 * det, og app'ens materialeloader (listCaseMaterialsCore) med brugerens egen klient. Opretter midlertidige brugere,
 * en kunde, to sager, en arbejdsordre og materialer, og sletter dem igen i `finally`. Ingen prod.
 *   npx tsx scripts/test-harness/cli.ts mp-00248-api
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomBytes, randomUUID } from 'crypto'
import type { Permission } from '../../src/lib/auth/permissions'
import { userCanViewCase } from '../../src/lib/auth/case-scope'
import { CASE_MATERIAL_PUBLIC_COLUMNS, listCaseMaterialsCore } from '../../src/lib/materials/case-material-costs'
import type { UserRole } from '../../src/types/auth.types'

export interface Api00248Check { id: string; ok: boolean; note?: string }

const KEYS: Permission[] = ['materials.view', 'materials.view.cost_prices', 'economy.cost_prices', 'cases.view.all']

export async function runApi00248(c: { admin: SupabaseClient; url: string; anonKey: string }): Promise<Api00248Check[]> {
  const out: Api00248Check[] = []
  const add = (id: string, ok: boolean, note = '') => out.push({ id, ok, note: note || undefined })
  const stamp = Date.now()
  const users: string[] = []
  let custId: string | null = null
  const caseIds: string[] = []
  let empId: string | null = null
  let woId: string | null = null
  let woForeignId: string | null = null

  const tempUser = async (role: UserRole) => {
    const email = `p248-${role === 'montør' ? 'montor' : role}-${stamp}-${users.length}@harness.test`
    const password = `P248!${randomBytes(12).toString('base64url')}`
    const { data: u, error } = await c.admin.auth.admin.createUser({ email, password, email_confirm: true })
    if (error || !u.user) throw new Error(`createUser: ${error?.message}`)
    users.push(u.user.id)
    await c.admin.from('profiles').upsert([{ id: u.user.id, role, is_active: true, full_name: `[HARNESS] p248 ${role}` }], { onConflict: 'id' })
    const cl = createClient(c.url, c.anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const { error: sErr } = await cl.auth.signInWithPassword({ email, password })
    if (sErr) throw new Error(`login: ${sErr.message}`)
    return { uid: u.user.id, role, cl }
  }
  type Persona = Awaited<ReturnType<typeof tempUser>>
  const perms = async (p: Persona) => {
    const set = new Set<Permission>()
    for (const k of KEYS) if ((await p.cl.rpc('user_has_permission', { p_permission: k })).data === true) set.add(k)
    return set
  }
  const load = async (p: Persona, caseId: string) => {
    const set = await perms(p)
    return listCaseMaterialsCore({
      supabase: p.cl,
      admin: c.admin,
      hasPermission: (k) => set.has(k),
      canViewCase: (id) => userCanViewCase(id, { role: p.role, userId: p.uid, supabase: p.cl }),
    }, caseId)
  }
  const denied = (r: { error: { code?: string } | null }) => r.error?.code === '42501'
  const clearOverrides = async (p: Persona) => { await c.admin.from('user_permission_overrides').delete().eq('profile_id', p.uid) }
  const override = async (p: Persona, effect: 'grant' | 'revoke', keys: Permission[] = ['materials.view.cost_prices']) => {
    await clearOverrides(p)
    const { error } = await c.admin.from('user_permission_overrides').insert(keys.map((permission) => ({ profile_id: p.uid, permission, effect, source: 'manual', reason: 'p248api' })))
    if (error) throw new Error(`override: ${error.message}`)
  }

  try {
    const owner = ((await c.admin.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).limit(1).single()).data as { id: string }).id
    custId = ((await c.admin.from('customers').insert({ customer_number: `HARN-248-${stamp}`, company_name: '[HARNESS] 248', contact_person: 'R', email: `p248-${stamp}@harness.test`, created_by: owner }).select('id').single()).data as { id: string }).id
    for (const title of ['[HARNESS] 248 synlig', '[HARNESS] 248 fremmed']) {
      caseIds.push(((await c.admin.from('service_cases').insert({ customer_id: custId, title, status: 'in_progress', created_by: owner }).select('id').single()).data as { id: string }).id)
    }
    const [visible, hidden] = caseIds
    const m = await tempUser('montør')
    const sl = await tempUser('serviceleder')
    empId = ((await c.admin.from('employees').insert({ name: `[HARNESS] p248 ${stamp}`, email: `p248e-${stamp}@harness.test`, role: 'montør', active: true, profile_id: m.uid }).select('id').single()).data as { id: string }).id
    woId = ((await c.admin.from('work_orders').insert({ case_id: visible, customer_id: custId, title: '[HARNESS] 248', status: 'planned', scheduled_date: new Date().toISOString().slice(0, 10), assigned_employee_id: empId }).select('id').single()).data as { id: string }).id
    const ins = await c.admin.from('case_materials').insert([
      { case_id: visible, description: 'p248 kendt', quantity: 2, unit: 'stk', unit_cost: 12.34, unit_sales_price: 20, source: 'manual', created_by: owner },
      { case_id: visible, description: 'p248 nul', quantity: 1, unit: 'stk', unit_cost: 0, unit_sales_price: 5, source: 'manual', created_by: owner },
      { case_id: visible, description: 'p248 ukendt', quantity: 1, unit: 'stk', unit_cost: null, unit_sales_price: 30, source: 'manual', created_by: owner },
      { case_id: hidden, description: 'p248 fremmed', quantity: 1, unit: 'stk', unit_cost: 99.99, unit_sales_price: 150, source: 'manual', created_by: owner },
    ]).select('id')
    if (ins.error) throw new Error(`materialer: ${ins.error.message}`)
    const SECRETS = ['12.34', '24.68', '99.99']
    const leaks = (x: unknown) => SECRETS.filter((s) => JSON.stringify(x).includes(s))

    // ---- Montør, direkte PostgREST ----
    const mp = await perms(m)
    add('montør: har materials.view, ikke materials.view.cost_prices', mp.has('materials.view') && !mp.has('materials.view.cost_prices'))
    const safe = await m.cl.from('case_materials').select('id, description, quantity, unit, unit_sales_price').eq('case_id', visible)
    add('montør: rækkerne er synlige med beskrivelse, antal og enhed', !safe.error && (safe.data ?? []).length === 3, safe.error?.message ?? String((safe.data ?? []).length))
    const safeAll = await m.cl.from('case_materials').select(CASE_MATERIAL_PUBLIC_COLUMNS).eq('case_id', visible)
    add('montør: alle offentlige kolonner kan vælges', !safeAll.error && (safeAll.data ?? []).length === 3, safeAll.error?.message)
    const foreign = await m.cl.from('case_materials').select('id').eq('case_id', hidden)
    add('montør: fremmed sags materialer er usynlige (scope uændret)', !foreign.error && (foreign.data ?? []).length === 0)
    add('montør: SELECT unit_cost afvist (42501)', denied(await m.cl.from('case_materials').select('unit_cost').eq('case_id', visible)))
    add('montør: SELECT total_cost afvist (42501)', denied(await m.cl.from('case_materials').select('total_cost').eq('case_id', visible)))
    add('montør: SELECT * afvist (42501)', denied(await m.cl.from('case_materials').select('*').eq('case_id', visible)))
    add('montør: filter unit_cost IS NULL afvist', denied(await m.cl.from('case_materials').select('id').is('unit_cost', null)))
    add('montør: filter unit_cost IS NOT NULL afvist', denied(await m.cl.from('case_materials').select('id').not('unit_cost', 'is', null)))
    add('montør: filter total_cost > 0 afvist', denied(await m.cl.from('case_materials').select('id').gt('total_cost', 0)))
    add('montør: sortering på unit_cost afvist', denied(await m.cl.from('case_materials').select('id').order('unit_cost')))
    add('montør: indlejret case_materials(unit_cost) afvist', denied(await m.cl.from('service_cases').select('id, case_materials(unit_cost)').eq('id', visible)))
    add('montør: indlejret case_materials(*) afvist', denied(await m.cl.from('service_cases').select('id, case_materials(*)').eq('id', visible)))
    const embedSafe = await m.cl.from('service_cases').select('id, case_materials(id, description)').eq('id', visible)
    add('montør: indlejret med ufarlige kolonner virker', !embedSafe.error, embedSafe.error?.message)
    const rpc = await m.cl.rpc('calculate_work_order_profit', { p_work_order_id: woId })
    add('montør: profitberegningen kan ikke kaldes', !!rpc.error)
    const wop = await m.cl.from('work_order_profit').select('id, profit').eq('work_order_id', woId as string)
    add('montør: ingen avance-snapshots', !!wop.error || (wop.data ?? []).length === 0)

    // ---- Montør, app'ens loader ----
    const mList = await load(m, visible)
    const mRows = mList.success ? mList.data.rows : []
    add('montør-loader: 3 rækker', mList.success && mRows.length === 3)
    add('montør-loader: kost er null på alle linjer', mRows.length === 3 && mRows.every((r) => r.unit_cost === null && r.total_cost === null))
    add('montør-loader: kendt og ukendt kan ikke skelnes', (() => {
      const k = mRows.find((r) => r.description === 'p248 kendt'), u = mRows.find((r) => r.description === 'p248 ukendt'), z = mRows.find((r) => r.description === 'p248 nul')
      return !!k && !!u && !!z && [k, u, z].every((r) => r.unit_cost === null && r.total_cost === null)
    })())
    add('montør-loader: summen skjult (null), intet antal ukendte', mList.success && mList.data.summary.total_cost === null && mList.data.summary.unknown_cost_lines === null && mList.data.summary.contribution_margin === null)
    add('montør-loader: ingen kostværdi i svaret', leaks(mList).length === 0, leaks(mList).join(','))
    const mForeign = await load(m, hidden)
    add('montør-loader: fremmed sag giver ingen rækker', mForeign.success && mForeign.data.rows.length === 0)

    // ---- Serviceleder (har ret), direkte og loader ----
    const sp = await perms(sl)
    add('serviceleder: har materials.view.cost_prices', sp.has('materials.view.cost_prices'))
    add('serviceleder: direkte SELECT unit_cost afvist også med ret', denied(await sl.cl.from('case_materials').select('unit_cost').eq('case_id', visible)))
    const sList = await load(sl, visible)
    const by = (d: string) => (sList.success ? sList.data.rows.find((r) => r.description === d) : undefined)
    add('serviceleder-loader: kendt kost 12,34 og total 24,68', by('p248 kendt')?.unit_cost === 12.34 && by('p248 kendt')?.total_cost === 24.68)
    add('serviceleder-loader: rigtig 0 er 0', by('p248 nul')?.unit_cost === 0 && by('p248 nul')?.total_cost === 0)
    add('serviceleder-loader: ukendt er null', by('p248 ukendt')?.unit_cost === null && by('p248 ukendt')?.total_cost === null)
    add('serviceleder-loader: sum ukendt, kendt del 24,68, 1 ukendt', sList.success && sList.data.summary.total_cost === null && sList.data.summary.total_cost_known === 24.68 && sList.data.summary.unknown_cost_lines === 1)
    add('serviceleder-loader: fremmed sag uden for listen', !leaks(sList).includes('99.99'))

    // ---- Per-bruger GRANT: montør får ret → loader viser kost på egen sag, aldrig fremmed; API stadig lukket ----
    await override(m, 'grant')
    const gp = await perms(m)
    add('GRANT: montør har nu materials.view.cost_prices', gp.has('materials.view.cost_prices'))
    const gList = await load(m, visible)
    const g = (d: string) => (gList.success ? gList.data.rows.find((r) => r.description === d) : undefined)
    add('GRANT: loader viser montørens kendte kost', g('p248 kendt')?.unit_cost === 12.34 && g('p248 ukendt')?.unit_cost === null && g('p248 nul')?.unit_cost === 0)
    const gForeign = await load(m, hidden)
    add('GRANT: fremmed sag stadig skjult (ret udvider ikke scope)', gForeign.success && gForeign.data.rows.length === 0 && !leaks(gForeign).includes('99.99'))
    add('GRANT: direkte SELECT unit_cost stadig afvist', denied(await m.cl.from('case_materials').select('unit_cost').eq('case_id', visible)))

    // ---- Per-bruger REVOKE: serviceleder mister ret → loader skjuler ----
    await override(sl, 'revoke')
    const rp = await perms(sl)
    add('REVOKE: serviceleder mangler nu materials.view.cost_prices', !rp.has('materials.view.cost_prices'))
    const rList = await load(sl, visible)
    add('REVOKE: loader viser null på alle linjer', rList.success && rList.data.rows.length === 3 && rList.data.rows.every((r) => r.unit_cost === null && r.total_cost === null))
    add('REVOKE: ingen kostværdi og intet antal ukendte i svaret', leaks(rList).length === 0 && rList.success && rList.data.summary.unknown_cost_lines === null)

    // =========== Skrive-værn på kosten (00248 §6) og avance efter effektive rettigheder (§7) ===========
    const [knownId, zeroId, unknownId, foreignId] = ((ins.data ?? []) as Array<{ id: string }>).map((r) => r.id)
    const costOf = async (id: string) => ((await c.admin.from('case_materials').select('unit_cost').eq('id', id).single()).data as { unit_cost: number | null }).unit_cost
    const insertWithCost = (p: Persona, cost: number | null) => p.cl.from('case_materials')
      .insert({ case_id: visible, description: 'p248 api skriv', quantity: 1, unit: 'stk', unit_cost: cost, source: 'manual', created_by: p.uid }).select('id')
    const patch = (p: Persona, id: string, body: Record<string, unknown>) => p.cl.from('case_materials').update(body).eq('id', id).select('id')
    const profitRows = async (p: Persona, ids: string[]) => {
      const r = await p.cl.from('work_order_profit').select('id, work_order_id').in('work_order_id', ids)
      return r.error ? -1 : (r.data ?? []).length
    }
    // udførte ordrer → snapshots (egen ordre tildelt montøren, fremmed ordre på den skjulte sag)
    woForeignId = ((await c.admin.from('work_orders').insert({ case_id: hidden, customer_id: custId, title: '[HARNESS] 248 fremmed', status: 'planned', scheduled_date: new Date().toISOString().slice(0, 10) }).select('id').single()).data as { id: string }).id
    await c.admin.from('work_orders').update({ status: 'done' }).in('id', [woId as string, woForeignId])
    const bothWo = [woId as string, woForeignId]
    const snaps = await c.admin.from('work_order_profit').select('work_order_id').in('work_order_id', bothWo)
    add('avance-snapshots findes for egen og fremmed ordre', new Set((snaps.data ?? []).map((x) => (x as { work_order_id: string }).work_order_id)).size === 2)
    await clearOverrides(m)
    await clearOverrides(sl)

    // ---- Montør (standard, uden kost-ret) ----
    add('skriv/montør: INSERT med kost afvist (42501)', denied(await insertWithCost(m, 5)))
    add('skriv/montør: INSERT med kost 0 afvist (42501)', denied(await insertWithCost(m, 0)))
    const mNull = await insertWithCost(m, null)
    add('skriv/montør: INSERT med ukendt kost (null) virker', !mNull.error && (mNull.data ?? []).length === 1, mNull.error?.message)
    const mPatch = await patch(m, zeroId, { unit_cost: 7 })
    add('skriv/montør: PATCH kost ændrer intet', (mPatch.error != null || (mPatch.data ?? []).length === 0) && (await costOf(zeroId)) === 0)
    add('avance/montør: ingen snapshots', (await profitRows(m, bothWo)) === 0)
    add('avance/montør: snapshot-RPC afvist', !!(await m.cl.rpc('snapshot_work_order_profit', { p_work_order_id: woId, p_source: 'manual' })).error)

    // ---- Serviceleder (standard) ----
    const slSet = await patch(sl, zeroId, { unit_cost: 1 })
    add('skriv/serviceleder: må rette kost', !slSet.error && (slSet.data ?? []).length === 1 && (await costOf(zeroId)) === 1, slSet.error?.message)
    await patch(sl, zeroId, { unit_cost: 0 })
    add('avance/serviceleder: ser egen og fremmed ordres avance', (await profitRows(sl, bothWo)) === 2)

    // ---- Serviceleder med per-bruger REVOKE af materials.view.cost_prices ----
    await override(sl, 'revoke')
    add('skriv/REVOKE: PATCH samme værdi afvist (intet orakel)', denied(await patch(sl, zeroId, { unit_cost: 0 })))
    const slOther = await patch(sl, zeroId, { unit_cost: 5 })
    add('skriv/REVOKE: PATCH anden værdi afvist', denied(slOther))
    add('skriv/REVOKE: fejlteksten indeholder intet beløb', !!slOther.error && !/\d/.test(slOther.error.message), slOther.error?.message)
    add('skriv/REVOKE: tal → null afvist', denied(await patch(sl, knownId, { unit_cost: null })))
    add('skriv/REVOKE: null → tal afvist', denied(await patch(sl, unknownId, { unit_cost: 1 })))
    add('skriv/REVOKE: INSERT med kost afvist', denied(await insertWithCost(sl, 2)))
    add('skriv/REVOKE: upsert med kost afvist', (await sl.cl.from('case_materials').upsert({ id: zeroId, case_id: visible, description: 'p248 nul', quantity: 1, unit_cost: 9, source: 'manual' }, { onConflict: 'id' }).select('id')).error != null)
    add('skriv/REVOKE: total_cost kan ikke skrives', (await patch(sl, zeroId, { total_cost: 1 })).error != null)
    const slQty = await patch(sl, zeroId, { quantity: 3, notes: 'p248' })
    add('skriv/REVOKE: ufarlige felter kan stadig rettes', !slQty.error && (slQty.data ?? []).length === 1, slQty.error?.message)
    const slNull = await insertWithCost(sl, null)
    add('skriv/REVOKE: ny linje med ukendt kost virker', !slNull.error && (slNull.data ?? []).length === 1, slNull.error?.message)
    add('skriv/REVOKE: kosterne er uændrede', (await costOf(zeroId)) === 0 && (await costOf(knownId)) === 12.34 && (await costOf(unknownId)) === null)
    add('avance/REVOKE materialekost: ingen snapshots', (await profitRows(sl, bothWo)) === 0)
    await override(sl, 'revoke', ['economy.cost_prices'])
    add('avance/REVOKE economy.cost_prices: ingen snapshots', (await profitRows(sl, bothWo)) === 0)
    await clearOverrides(sl)
    add('avance/serviceleder igen uden override: ser avance', (await profitRows(sl, bothWo)) === 2)

    // ---- Montør med per-bruger GRANT af begge kost-nøgler ----
    await override(m, 'grant', ['materials.view.cost_prices', 'economy.cost_prices'])
    add('avance/GRANT montør: egen ordre synlig', (await profitRows(m, [woId as string])) >= 1)
    add('avance/GRANT montør: fremmed ordre skjult (scope)', (await profitRows(m, [woForeignId])) === 0)
    const mCost = await insertWithCost(m, 4)
    add('skriv/GRANT montør: INSERT med kost virker', !mCost.error && (mCost.data ?? []).length === 1, mCost.error?.message)
    await clearOverrides(m)

    // ---- Admin ----
    const ad = await tempUser('admin')
    add('avance/admin: ser egen og fremmed ordres avance', (await profitRows(ad, bothWo)) === 2)

    // =========== Skrivning efter effektiv ret + sags-scope (00248 §8) ===========
    const foreignRow = async () => (await c.admin.from('case_materials').select('case_id, description, quantity, unit_cost').eq('id', foreignId).single()).data as Record<string, unknown>
    const foreignBefore = JSON.stringify(await foreignRow())
    const noLeak = (e: unknown) => !JSON.stringify(e ?? '').includes(hidden) && !/99[.,]99/.test(JSON.stringify(e ?? ''))
    const insertOn = (p: Persona, caseId: string, extra: Record<string, unknown> = {}) => p.cl.from('case_materials')
      .insert({ case_id: caseId, description: 'p248 scope', quantity: 1, unit: 'stk', source: 'manual', created_by: p.uid, ...extra }).select('id')
    const rowsOf = (r: { data: unknown[] | null; error: unknown }) => (r.error ? -1 : (r.data ?? []).length)

    // ---- Montør (standard) ----
    const mForeignIns = await insertOn(m, hidden)
    const mGhostIns = await insertOn(m, randomUUID())
    add('scope/montør: INSERT på fremmed sag afvist (42501)', denied(mForeignIns))
    add('scope/montør: fremmed og ikke-eksisterende sag giver samme fejl', mForeignIns.error?.code === mGhostIns.error?.code && mForeignIns.error?.message === mGhostIns.error?.message && mForeignIns.error?.details === mGhostIns.error?.details)
    add('scope/montør: fejlen afslører ikke sagen', noLeak(mForeignIns.error) && noLeak(mGhostIns.error))
    add('scope/montør: INSERT med fremmed sags arbejdsordre afvist', denied(await insertOn(m, visible, { work_order_id: woForeignId })))
    const mOwn = await insertOn(m, visible, { work_order_id: woId })
    add('scope/montør: INSERT på egen sag virker', !mOwn.error && (mOwn.data ?? []).length === 1, mOwn.error?.message)
    add('scope/montør: UPDATE af fremmed materiale rammer 0', rowsOf(await patch(m, foreignId, { description: 'hacket' })) <= 0)
    add('scope/montør: DELETE af fremmed materiale rammer 0', rowsOf(await m.cl.from('case_materials').delete().eq('id', foreignId).select('id')) <= 0)

    // ---- Montør med per-bruger GRANT af materials.edit + materials.delete: scope gælder stadig ----
    await override(m, 'grant', ['materials.edit', 'materials.delete'])
    const ownId = ((mOwn.data ?? []) as Array<{ id: string }>)[0]?.id ?? ''
    add('scope/GRANT montør: UPDATE af egen linje virker', rowsOf(await patch(m, ownId, { notes: 'p248 egen' })) === 1)
    add('scope/GRANT montør: UPDATE af fremmed materiale rammer 0', rowsOf(await patch(m, foreignId, { description: 'hacket' })) <= 0)
    add('scope/GRANT montør: DELETE af fremmed materiale rammer 0', rowsOf(await m.cl.from('case_materials').delete().eq('id', foreignId).select('id')) <= 0)
    const mUpsert = await m.cl.from('case_materials').upsert({ id: foreignId, case_id: visible, description: 'hacket', quantity: 1, source: 'manual' }, { onConflict: 'id' }).select('id')
    add('scope/GRANT montør: upsert på fremmed materiale afvist', mUpsert.error != null && noLeak(mUpsert.error), mUpsert.error?.message)
    const mMove = await patch(m, ownId, { case_id: hidden })
    add('scope/GRANT montør: flyt egen linje til fremmed sag afvist', denied(mMove) && noLeak(mMove.error), mMove.error?.message)
    add('scope/GRANT montør: kost stadig afvist uden kost-ret', denied(await patch(m, ownId, { unit_cost: 1 })))
    add('scope/GRANT montør: DELETE af egen linje virker', rowsOf(await m.cl.from('case_materials').delete().eq('id', ownId).select('id')) === 1)
    await clearOverrides(m)
    add('scope/montør: fremmed materiale er urørt', JSON.stringify(await foreignRow()) === foreignBefore)

    // ---- Serviceleder: standard skriver på alle sager; per-bruger REVOKE af hver skrivenøgle ----
    const slIns = await insertOn(sl, hidden, { unit_cost: 2 })
    const slId = ((slIns.data ?? []) as Array<{ id: string }>)[0]?.id ?? ''
    add('scope/serviceleder: INSERT (med kost) på enhver sag', !slIns.error && !!slId, slIns.error?.message)
    add('scope/serviceleder: UPDATE virker', rowsOf(await patch(sl, slId, { quantity: 2 })) === 1)
    add('scope/serviceleder: flyt til anden sag afvist', denied(await patch(sl, slId, { case_id: visible })))
    await override(sl, 'revoke', ['materials.edit'])
    add('scope/REVOKE materials.edit: UPDATE rammer 0', rowsOf(await patch(sl, slId, { quantity: 9 })) <= 0)
    await override(sl, 'revoke', ['materials.add_to_case'])
    add('scope/REVOKE materials.add_to_case: INSERT afvist', denied(await insertOn(sl, visible)))
    await override(sl, 'revoke', ['materials.delete'])
    add('scope/REVOKE materials.delete: DELETE rammer 0', rowsOf(await sl.cl.from('case_materials').delete().eq('id', slId).select('id')) <= 0)
    await override(sl, 'revoke', ['materials.view.cost_prices'])
    add('scope/REVOKE kost: ufarlig UPDATE virker, kost afvist', rowsOf(await patch(sl, slId, { notes: 'p248' })) === 1 && denied(await patch(sl, slId, { unit_cost: 3 })))
    await clearOverrides(sl)
    add('scope/serviceleder: DELETE virker igen uden override', rowsOf(await sl.cl.from('case_materials').delete().eq('id', slId).select('id')) === 1)

    // ---- Admin ----
    const adIns = await insertOn(ad, hidden, { unit_cost: 3 })
    const adId = ((adIns.data ?? []) as Array<{ id: string }>)[0]?.id ?? ''
    add('scope/admin: INSERT, UPDATE (inkl. kost) og DELETE', !adIns.error && rowsOf(await patch(ad, adId, { unit_cost: 4, quantity: 2 })) === 1 && rowsOf(await ad.cl.from('case_materials').delete().eq('id', adId).select('id')) === 1, adIns.error?.message)

    // ---- Uændret: læse-lockdown ----
    add('uændret: montør SELECT unit_cost stadig afvist', denied(await m.cl.from('case_materials').select('unit_cost').eq('case_id', visible)))
    add('uændret: admin SELECT total_cost stadig afvist', denied(await ad.cl.from('case_materials').select('total_cost').limit(1)))
  } catch (e) {
    add('intet kast', false, e instanceof Error ? e.message : String(e))
  } finally {
    if (users.length) await c.admin.from('user_permission_overrides').delete().in('profile_id', users)
    if (caseIds.length) await c.admin.from('case_materials').delete().in('case_id', caseIds)
    for (const w of [woId, woForeignId]) if (w) { await c.admin.from('work_order_profit').delete().eq('work_order_id', w); await c.admin.from('work_orders').delete().eq('id', w) }
    if (caseIds.length) await c.admin.from('service_cases').delete().in('id', caseIds)
    if (custId) await c.admin.from('customers').delete().eq('id', custId)
    if (empId) await c.admin.from('employees').delete().eq('id', empId)
    for (const u of users) {
      await c.admin.from('profiles').delete().eq('id', u)
      await c.admin.auth.admin.deleteUser(u).catch(() => {})
    }
  }
  return out
}
