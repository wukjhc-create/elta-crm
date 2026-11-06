/**
 * 00248 med RIGTIGE persona-klienter mod STAGING (kræver at 00248 er anvendt): PostgREST som brugeren selv ville kalde
 * det, og app'ens materialeloader (listCaseMaterialsCore) med brugerens egen klient. Opretter midlertidige brugere,
 * en kunde, to sager, en arbejdsordre og materialer, og sletter dem igen i `finally`. Ingen prod.
 *   npx tsx scripts/test-harness/cli.ts mp-00248-api
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'
import type { Permission } from '../../src/lib/auth/permissions'
import { userCanViewCase } from '../../src/lib/auth/case-scope'
import { CASE_MATERIAL_PUBLIC_COLUMNS, listCaseMaterialsCore } from '../../src/lib/materials/case-material-costs'
import type { UserRole } from '../../src/types/auth.types'

export interface Api00248Check { id: string; ok: boolean; note?: string }

const KEYS: Permission[] = ['materials.view', 'materials.view.cost_prices', 'cases.view.all']

export async function runApi00248(c: { admin: SupabaseClient; url: string; anonKey: string }): Promise<Api00248Check[]> {
  const out: Api00248Check[] = []
  const add = (id: string, ok: boolean, note = '') => out.push({ id, ok, note: note || undefined })
  const stamp = Date.now()
  const users: string[] = []
  let custId: string | null = null
  const caseIds: string[] = []
  let empId: string | null = null
  let woId: string | null = null

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
  const override = async (p: Persona, effect: 'grant' | 'revoke') => {
    await c.admin.from('user_permission_overrides').delete().eq('profile_id', p.uid)
    const { error } = await c.admin.from('user_permission_overrides').insert({ profile_id: p.uid, permission: 'materials.view.cost_prices', effect, source: 'manual', reason: 'p248api' })
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
  } catch (e) {
    add('intet kast', false, e instanceof Error ? e.message : String(e))
  } finally {
    if (users.length) await c.admin.from('user_permission_overrides').delete().in('profile_id', users)
    if (caseIds.length) await c.admin.from('case_materials').delete().in('case_id', caseIds)
    if (woId) { await c.admin.from('work_order_profit').delete().eq('work_order_id', woId); await c.admin.from('work_orders').delete().eq('id', woId) }
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
