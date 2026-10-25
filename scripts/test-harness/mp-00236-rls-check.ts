/**
 * MP-00236 på staging — direkte REST (rigtige persona-sessioner): opgave-sletning efter Henriks regel og tagtegninger på
 * lukket sag. [NY] = strammes af 00236 (fejler før migrationen), [UÆNDRET] = legitim adgang der skal virke før og efter.
 *   npx tsx scripts/test-harness/cli.ts mp-00236-rls-check
 * Midlertidige rækker ([HARNESS]) ryddes altid. 00235-matrixen køres separat (sec-b7-rls-check).
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface M236Check { id: string; ok: boolean; note: string; kind: 'NY' | 'UÆNDRET' }

export async function runMp00236RlsCheck(c: { admin: SupabaseClient; url: string; anonKey: string }): Promise<M236Check[]> {
  const out: M236Check[] = []
  const add = (kind: M236Check['kind'], id: string, ok: boolean, note: string) => out.push({ id, ok, note, kind })
  const { loginPersonas } = await import('./role-matrix')
  const p = await loginPersonas({ url: c.url, anonKey: c.anonKey, admin: c.admin })
  const cl = (role: string) => p.get(role as never)!
  const uidOf = async (role: string) => (await cl(role).auth.getUser()).data.user!.id
  const montorUid = await uidOf('montør'), adminUid = await uidOf('admin'), salgUid = await uidOf('salg'), bogUid = await uidOf('bogholderi')
  const stamp = Date.now()
  const denied = (r: { error: unknown; data: unknown[] | null }) => !!r.error || (r.data ?? []).length === 0
  const allowed = (r: { error: unknown; data: unknown[] | null }) => !r.error && (r.data ?? []).length === 1
  const why = (r: { error: { code?: string; message?: string } | null; data: unknown[] | null }) => r.error ? (r.error.code ?? r.error.message ?? 'fejl') : `rækker=${(r.data ?? []).length}`
  const cleanup: Array<() => PromiseLike<unknown>> = []
  try {
    const { data: existingEmp } = await c.admin.from('employees').select('id').eq('profile_id', montorUid).maybeSingle()
    let empId = (existingEmp as { id: string } | null)?.id ?? null
    if (!empId) {
      const { data: e, error } = await c.admin.from('employees').insert({ name: '[HARNESS] 236-montør', email: `m236-${stamp}@harness.test`, role: 'montør', active: true, hourly_rate: 495, cost_rate: 300, profile_id: montorUid }).select('id').single()
      if (error) throw new Error(`employee: ${error.message}`)
      empId = (e as { id: string }).id
      cleanup.push(() => c.admin.from('employees').delete().eq('id', empId!))
    }
    const { data: cu, error: cuErr } = await c.admin.from('customers').insert({ customer_number: `M236-${stamp}`, company_name: `[HARNESS] 236 ${stamp}`, contact_person: 'X', email: `m236-${stamp}@harness.test`, created_by: adminUid }).select('id').single()
    if (cuErr) throw new Error(`kunde: ${cuErr.message}`)
    const cust = (cu as { id: string }).id
    cleanup.push(() => c.admin.from('customers').delete().eq('id', cust))
    let n = 0
    const mkCase = async (status: string) => {
      const { data, error } = await c.admin.from('service_cases').insert({ case_number: `SVC-6${String(stamp).slice(-5)}${++n}`, customer_id: cust, title: '[HARNESS] 236', status, created_by: adminUid }).select('id').single()
      if (error) throw new Error(`sag: ${error.message}`)
      return (data as { id: string }).id
    }
    const openCase = await mkCase('in_progress')
    const closedCase = await mkCase('in_progress')
    const { data: wo, error: woErr } = await c.admin.from('work_orders').insert({ case_id: openCase, customer_id: cust, title: '[HARNESS] 236', status: 'planned', scheduled_date: '2026-11-01', assigned_employee_id: empId }).select('id').single()
    if (woErr) throw new Error(`wo: ${woErr.message}`)
    const woId = (wo as { id: string }).id
    cleanup.push(async () => {
      await c.admin.from('work_order_profit').delete().eq('work_order_id', woId)
      await c.admin.from('work_orders').delete().eq('id', woId)
      await c.admin.from('service_cases').delete().in('id', [openCase, closedCase])
    })

    // ---------- opgave-sletning ----------
    const taskIds: string[] = []
    cleanup.unshift(() => c.admin.from('customer_tasks').delete().in('id', taskIds))
    const seed = async (row: Record<string, unknown>) => {
      const { data, error } = await c.admin.from('customer_tasks').insert({ customer_id: cust, title: `[HARNESS] 236 ${stamp}`, status: 'pending', priority: 'normal', ...row }).select('id').single()
      if (error) throw new Error(`opgave: ${error.message}`)
      taskIds.push((data as { id: string }).id)
      return (data as { id: string }).id
    }
    const del = (role: string, id: string) => cl(role).from('customer_tasks').delete().eq('id', id).select('id')
    let r = await del('salg', await seed({ created_by: adminUid, assigned_to: adminUid }))
    add('NY', 'D1 salg kan ikke slette en andens opgave', denied(r), why(r))
    r = await del('salg', await seed({ created_by: salgUid, assigned_to: adminUid }))
    add('UÆNDRET', 'D2 salg sletter egen oprettet opgave', allowed(r), why(r))
    r = await del('salg', await seed({ created_by: salgUid, assigned_to: salgUid, auto_generated: true, auto_rule: 'harness_236' }))
    add('NY', 'D3 salg kan ikke slette en systemopgave', denied(r), why(r))
    r = await del('bogholderi', await seed({ created_by: adminUid, assigned_to: bogUid }))
    add('NY', 'D4 bogholderi kan ikke slette en opgave der kun er tildelt hende', denied(r), why(r))
    r = await del('bogholderi', await seed({ created_by: bogUid, assigned_to: adminUid }))
    add('UÆNDRET', 'D5 bogholderi sletter egen oprettet opgave', allowed(r), why(r))
    r = await del('montør', await seed({ created_by: montorUid, assigned_to: montorUid, service_case_id: openCase }))
    add('UÆNDRET', 'D6 montør sletter egen+tildelt opgave på sag i eget scope', allowed(r), why(r))
    r = await del('montør', await seed({ created_by: montorUid, assigned_to: montorUid }))
    add('NY', 'D7 montør kan ikke slette egen opgave uden sag', denied(r), why(r))
    r = await del('montør', await seed({ created_by: adminUid, assigned_to: montorUid, service_case_id: openCase }))
    add('NY', 'D8 montør kan ikke slette en opgave kontoret har oprettet', denied(r), why(r))
    r = await del('admin', await seed({ created_by: adminUid, assigned_to: salgUid, auto_generated: true, auto_rule: 'harness_236' }))
    add('UÆNDRET', 'D9 admin sletter systemopgave', allowed(r), why(r))
    r = await del('serviceleder', await seed({ created_by: salgUid, assigned_to: salgUid }))
    add('UÆNDRET', 'D10 serviceleder sletter andens opgave', allowed(r), why(r))

    // ---------- tagtegninger på lukket sag ----------
    const drawIds: string[] = []
    cleanup.unshift(() => c.admin.from('roof_drawings').delete().in('id', drawIds))
    const base = { title: `[HARNESS] 236 tag ${stamp}`, image_storage_path: `roof-drawings/harness/236-${stamp}.png`, image_width: 10, image_height: 10, panel_product_code: null, panel_count: 0, drawing_data: { panels: [] } }
    const { data: dOnClosed, error: dErr } = await c.admin.from('roof_drawings').insert({ ...base, customer_id: cust, service_case_id: closedCase, created_by: adminUid }).select('id').single()
    if (dErr) throw new Error(`tegning: ${dErr.message}`)
    drawIds.push((dOnClosed as { id: string }).id)
    await c.admin.from('service_cases').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', closedCase)
    const ins = async (role: string, uid: string, caseId: string | null) => {
      const res = await cl(role).from('roof_drawings').insert({ ...base, customer_id: cust, service_case_id: caseId, created_by: uid }).select('id')
      for (const x of (res.data ?? []) as Array<{ id: string }>) drawIds.push(x.id)
      return res
    }
    r = await ins('admin', adminUid, closedCase)
    add('NY', 'R13 admin kan ikke tegne på lukket sag', denied(r), why(r))
    r = await ins('salg', salgUid, closedCase)
    add('NY', 'R14 salg kan ikke tegne på lukket sag', denied(r), why(r))
    r = await cl('admin').from('roof_drawings').update({ panel_count: 5 }).eq('id', (dOnClosed as { id: string }).id).select('id')
    add('NY', 'R15 tegning på lukket sag kan ikke ændres', denied(r), why(r))
    r = await cl('admin').from('roof_drawings').delete().eq('id', (dOnClosed as { id: string }).id).select('id')
    add('NY', 'R16 tegning på lukket sag kan ikke slettes', denied(r), why(r))
    r = await ins('montør', montorUid, openCase)
    add('UÆNDRET', 'R17 montør tegner stadig på åben egen sag', allowed(r), why(r))
    r = await ins('salg', salgUid, null)
    add('UÆNDRET', 'R18 salg tegner stadig uden sag', allowed(r), why(r))
  } finally {
    for (const f of cleanup) { try { await f() } catch { /* ryd videre */ } }
  }
  return out
}

export function formatMp00236RlsCheck(checks: M236Check[]): string {
  const ny = checks.filter((k) => k.kind === 'NY')
  return [
    'MP-00236 direkte REST — staging',
    ...checks.map((k) => `  ${k.ok ? 'PASS' : 'FAIL'}  [${k.kind}] ${k.id} — ${k.note}`),
    `  [NY] bestået ${ny.filter((k) => k.ok).length}/${ny.length} · [UÆNDRET] bestået ${checks.filter((k) => k.kind === 'UÆNDRET' && k.ok).length}/${checks.length - ny.length}`,
  ].join('\n')
}
