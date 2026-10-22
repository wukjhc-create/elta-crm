/**
 * SEC-B7 / forslag 00235 på staging — direkte REST-skrivninger (rigtige persona-sessioner, uden om appen) på
 * customer_tasks, roof_drawings og work_orders skal følge samme autoritetsmodel som appen.
 * Hver kontrol beskriver FORVENTNINGEN EFTER 00235; markeret [NY] = strammes af 00235 (fejler før migrationen —
 * kørsel før anvendelse dokumenterer hullet), [UÆNDRET] = legitim adgang der skal virke både før og efter.
 *   npx tsx scripts/test-harness/cli.ts sec-b7-rls-check
 * Midlertidige rækker ([HARNESS]) ryddes altid.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@supabase/supabase-js'

export interface B7Check { id: string; ok: boolean; note: string; kind: 'NY' | 'UÆNDRET' }

export async function runSecB7RlsCheck(c: { admin: SupabaseClient; url: string; anonKey: string }): Promise<B7Check[]> {
  const out: B7Check[] = []
  const add = (kind: B7Check['kind'], id: string, ok: boolean, note: string) => out.push({ id, ok, note, kind })
  const { loginPersonas } = await import('./role-matrix')
  const p = await loginPersonas({ url: c.url, anonKey: c.anonKey, admin: c.admin })
  const cl = (role: string) => p.get(role as never)!
  const uidOf = async (role: string) => (await cl(role).auth.getUser()).data.user!.id
  const montorUid = await uidOf('montør')
  const adminUid = await uidOf('admin')
  const salgUid = await uidOf('salg')
  const bogUid = await uidOf('bogholderi')
  const stamp = Date.now()
  const denied = (r: { error: unknown; data: unknown[] | null }) => !!r.error || (r.data ?? []).length === 0
  const allowed = (r: { error: unknown; data: unknown[] | null }) => !r.error && (r.data ?? []).length === 1
  const why = (r: { error: { code?: string; message?: string } | null; data: unknown[] | null }) => r.error ? (r.error.code ?? r.error.message ?? 'fejl') : `rækker=${(r.data ?? []).length}`

  const cleanup: Array<() => PromiseLike<unknown>> = []
  try {
    // ---- seed: montør-medarbejder, kunde A (montør har job), kunde B (intet job), sager, arbejdsordrer
    const { data: existingEmp } = await c.admin.from('employees').select('id').eq('profile_id', montorUid).maybeSingle()
    let empId = (existingEmp as { id: string } | null)?.id ?? null
    if (!empId) {
      const { data: e, error } = await c.admin.from('employees').insert({ name: '[HARNESS] b7-montør', email: `b7-${stamp}@harness.test`, role: 'montør', active: true, hourly_rate: 495, cost_rate: 300, profile_id: montorUid }).select('id').single()
      if (error) throw new Error(`employee: ${error.message}`)
      empId = (e as { id: string }).id
      cleanup.push(() => c.admin.from('employees').delete().eq('id', empId!))
    }
    const mkCust = async (tag: string) => {
      const { data, error } = await c.admin.from('customers').insert({ customer_number: `B7${tag}-${stamp}`, company_name: `[HARNESS] b7 ${tag} ${stamp}`, contact_person: 'X', email: `b7${tag.toLowerCase()}-${stamp}@harness.test`, created_by: adminUid }).select('id').single()
      if (error) throw new Error(`kunde ${tag}: ${error.message}`)
      return (data as { id: string }).id
    }
    const custA = await mkCust('A')
    const custB = await mkCust('B')
    cleanup.push(() => c.admin.from('customers').delete().in('id', [custA, custB]))
    let n = 0
    const mkCase = async (cust: string, status: string) => {
      const { data, error } = await c.admin.from('service_cases').insert({ case_number: `SVC-7${String(stamp).slice(-5)}${++n}`, customer_id: cust, title: '[HARNESS] b7', status, created_by: adminUid }).select('id').single()
      if (error) throw new Error(`sag: ${error.message}`)
      return (data as { id: string }).id
    }
    const caseA = await mkCase(custA, 'in_progress')
    const caseB = await mkCase(custB, 'in_progress')
    const caseClosed = await mkCase(custA, 'in_progress')
    const caseIds = [caseA, caseB, caseClosed]
    const mkWo = async (caseId: string, cust: string, status: string) => {
      const { data, error } = await c.admin.from('work_orders').insert({ case_id: caseId, customer_id: cust, title: '[HARNESS] b7', status, scheduled_date: '2026-10-01', assigned_employee_id: empId }).select('id').single()
      if (error) throw new Error(`wo: ${error.message}`)
      return (data as { id: string }).id
    }
    const woA = await mkWo(caseA, custA, 'planned')
    const woClosed = await mkWo(caseClosed, custA, 'planned')
    const woIds = [woA, woClosed]
    // sagen lukkes EFTER arbejdsordren er oprettet (som i praksis: en hængende ordre på en lukket sag)
    await c.admin.from('service_cases').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', caseClosed)
    cleanup.push(async () => {
      await c.admin.from('work_order_profit').delete().in('work_order_id', woIds)
      await c.admin.from('work_orders').delete().in('id', woIds)
      await c.admin.from('service_cases').delete().in('id', caseIds)
    })

    // ================= customer_tasks =================
    const taskIds: string[] = []
    cleanup.unshift(() => c.admin.from('customer_tasks').delete().in('id', taskIds))
    const seedTask = async (assigned: string, cust = custA) => {
      const { data, error } = await c.admin.from('customer_tasks').insert({ customer_id: cust, title: `[HARNESS] b7 opgave ${stamp}`, status: 'pending', priority: 'normal', assigned_to: assigned, created_by: adminUid }).select('id').single()
      if (error) throw new Error(`opgave: ${error.message}`)
      taskIds.push((data as { id: string }).id)
      return (data as { id: string }).id
    }
    const ins = async (role: string, row: Record<string, unknown>) => {
      const r = await cl(role).from('customer_tasks').insert({ title: `[HARNESS] b7 ${role} ${stamp}`, status: 'pending', priority: 'normal', ...row }).select('id')
      for (const x of (r.data ?? []) as Array<{ id: string }>) taskIds.push(x.id)
      return r
    }
    let r = await ins('montør', { customer_id: custA, assigned_to: montorUid, created_by: montorUid })
    add('UÆNDRET', 'T1 montør opretter egen opgave hos kunde med eget job', allowed(r), why(r))
    r = await ins('montør', { customer_id: custB, assigned_to: montorUid, created_by: montorUid })
    add('NY', 'T2 montør kan ikke oprette opgave hos kunde uden eget job', denied(r), why(r))
    r = await ins('montør', { customer_id: custA, assigned_to: adminUid, created_by: montorUid })
    add('NY', 'T3 montør kan ikke oprette opgave til en anden', denied(r), why(r))
    r = await ins('montør', { customer_id: custA, assigned_to: montorUid, created_by: adminUid })
    add('NY', 'T4 montør kan ikke forfalske created_by', denied(r), why(r))
    r = await ins('bogholderi', { customer_id: custB, assigned_to: adminUid, created_by: bogUid })
    add('UÆNDRET', 'T5 bogholderi opretter opgave til andre (tasks.create)', allowed(r), why(r))
    // hver kontrol får sin egen opgave (en tilladt sletning/ændring må ikke påvirke de næste)
    r = await cl('montør').from('customer_tasks').update({ status: 'done' }).eq('id', await seedTask(adminUid)).select('id')
    add('NY', 'T6 montør kan ikke ændre en andens opgave', denied(r), why(r))
    r = await cl('montør').from('customer_tasks').delete().eq('id', await seedTask(adminUid)).select('id')
    add('NY', 'T7 montør kan ikke slette en andens opgave', denied(r), why(r))
    r = await cl('bogholderi').from('customer_tasks').update({ status: 'done' }).eq('id', await seedTask(adminUid)).select('id')
    add('NY', 'T8 bogholderi kan ikke ændre en andens opgave', denied(r), why(r))
    r = await cl('salg').from('customer_tasks').update({ priority: 'high' }).eq('id', await seedTask(adminUid)).select('id')
    add('UÆNDRET', 'T9 salg kan ændre enhver opgave (customers.edit)', allowed(r), why(r))
    r = await cl('salg').from('customer_tasks').update({ created_by: salgUid }).eq('id', await seedTask(adminUid)).select('id')
    add('NY', 'T10 created_by kan ikke ændres via REST', denied(r), why(r))
    const montorsTask = await seedTask(montorUid)
    r = await cl('montør').from('customer_tasks').update({ status: 'done', completed_at: new Date().toISOString() }).eq('id', montorsTask).select('id')
    add('UÆNDRET', 'T11 montør afslutter opgave tildelt sig selv', allowed(r), why(r))
    r = await cl('montør').from('customer_tasks').update({ assigned_to: adminUid }).eq('id', montorsTask).select('id')
    add('NY', 'T12 montør kan ikke omfordele opgave til en anden', denied(r), why(r))
    const anon = createClient(c.url, c.anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const an = await anon.from('customer_tasks').insert({ customer_id: custA, title: `[HARNESS] b7 anon ${stamp}`, status: 'pending', priority: 'normal' }).select('id')
    for (const x of (an.data ?? []) as Array<{ id: string }>) taskIds.push(x.id)
    add('UÆNDRET', 'T13 anon kan ikke skrive opgaver', denied(an), why(an))

    // ================= roof_drawings =================
    const drawIds: string[] = []
    cleanup.unshift(() => c.admin.from('roof_drawings').delete().in('id', drawIds))
    const baseDraw = { title: `[HARNESS] b7 tag ${stamp}`, image_storage_path: `roof-drawings/harness/b7-${stamp}.png`, image_width: 10, image_height: 10, panel_product_code: null, panel_count: 0, drawing_data: { panels: [] } }
    const insD = async (role: string, row: Record<string, unknown>) => {
      const res = await cl(role).from('roof_drawings').insert({ ...baseDraw, ...row }).select('id')
      for (const x of (res.data ?? []) as Array<{ id: string }>) drawIds.push(x.id)
      return res
    }
    r = await insD('montør', { customer_id: custA, service_case_id: caseA, created_by: montorUid })
    add('UÆNDRET', 'R1 montør tegner på egen sag', allowed(r), why(r))
    const ownDraw = ((r.data ?? [])[0] as { id: string } | undefined)?.id ?? null
    r = await insD('montør', { customer_id: custB, service_case_id: caseB, created_by: montorUid })
    add('NY', 'R2 montør kan ikke tegne på en fremmed sag', denied(r), why(r))
    r = await insD('montør', { customer_id: custA, service_case_id: null, created_by: montorUid })
    add('NY', 'R3 montør kan ikke oprette tegning uden sag', denied(r), why(r))
    r = await insD('bogholderi', { customer_id: custA, service_case_id: null, created_by: bogUid })
    add('NY', 'R4 bogholderi kan ikke oprette tegning uden sag', denied(r), why(r))
    r = await insD('bogholderi', { customer_id: custB, service_case_id: caseB, created_by: bogUid })
    add('UÆNDRET', 'R5 bogholderi tegner på en sag', allowed(r), why(r))
    r = await insD('salg', { customer_id: custA, service_case_id: null, created_by: salgUid })
    add('UÆNDRET', 'R6 salg tegner uden sag (customers.edit)', allowed(r), why(r))
    r = await insD('salg', { customer_id: custA, service_case_id: caseB, created_by: salgUid })
    add('NY', 'R7 sag og kunde skal høre sammen (kryds-sag afvist)', denied(r), why(r))
    r = await insD('salg', { customer_id: custA, service_case_id: null, created_by: adminUid })
    add('NY', 'R8 created_by kan ikke forfalskes ved oprettelse', denied(r), why(r))
    const { data: foreign } = await c.admin.from('roof_drawings').insert({ ...baseDraw, customer_id: custB, service_case_id: caseB, created_by: adminUid }).select('id').single()
    const foreignId = (foreign as { id: string } | null)?.id ?? null
    if (foreignId) drawIds.push(foreignId)
    r = await cl('montør').from('roof_drawings').update({ panel_count: 99 }).eq('id', foreignId ?? '').select('id')
    add('NY', 'R9 montør kan ikke ændre en fremmed sags tegning', denied(r), why(r))
    r = await cl('montør').from('roof_drawings').delete().eq('id', foreignId ?? '').select('id')
    add('NY', 'R10 montør kan ikke slette en fremmed sags tegning', denied(r), why(r))
    if (ownDraw) {
      r = await cl('montør').from('roof_drawings').update({ panel_count: 3, drawing_data: { panels: [1, 2, 3] } }).eq('id', ownDraw).select('id')
      add('UÆNDRET', 'R11 montør gemmer egen tegning (panel_count/drawing_data)', allowed(r), why(r))
      r = await cl('montør').from('roof_drawings').update({ customer_id: custB }).eq('id', ownDraw).select('id')
      add('NY', 'R12 tegningens kunde/sag/opretter kan ikke ændres via REST', denied(r), why(r))
    }

    // ================= work_orders (00213 + 00235) =================
    r = await cl('montør').from('work_orders').update({ status: 'in_progress' }).eq('id', woA).select('id')
    add('UÆNDRET', 'W1 montør starter egen ordre', allowed(r), why(r))
    r = await cl('montør').from('work_orders').update({ status: 'done', completed_at: '2020-01-01T00:00:00Z' }).eq('id', woA).select('id')
    const { data: woRow } = await c.admin.from('work_orders').select('status, completed_at').eq('id', woA).single()
    const doneAt = (woRow as { completed_at: string | null } | null)?.completed_at
    add('UÆNDRET', 'W2 montør afslutter egen ordre', !r.error && (woRow as { status: string } | null)?.status === 'done', why(r))
    add('NY', 'W3 completed_at kan ikke tilbagedateres (sættes til nu)', !!doneAt && Math.abs(new Date(doneAt).getTime() - Date.now()) < 10 * 60_000, `completed_at=${doneAt}`)
    r = await cl('montør').from('work_orders').update({ status: 'in_progress' }).eq('id', woClosed).select('id')
    add('NY', 'W4 montør kan ikke ændre ordre på lukket sag', denied(r), why(r))
    r = await cl('montør').from('work_orders').update({ assigned_employee_id: null, status: 'in_progress' }).eq('id', woA).select('id')
    add('UÆNDRET', 'W5 montør kan ikke ændre tildeling (00213)', denied(r), why(r))
  } finally {
    for (const f of cleanup) { try { await f() } catch { /* ryd videre */ } }
  }
  return out
}

export function formatSecB7RlsCheck(checks: B7Check[]): string {
  const ny = checks.filter((k) => k.kind === 'NY')
  return [
    'SEC-B7 / 00235 direkte REST-skrivninger — staging',
    ...checks.map((k) => `  ${k.ok ? 'PASS' : 'FAIL'}  [${k.kind}] ${k.id} — ${k.note}`),
    `  [NY] bestået ${ny.filter((k) => k.ok).length}/${ny.length} · [UÆNDRET] bestået ${checks.filter((k) => k.kind === 'UÆNDRET' && k.ok).length}/${checks.length - ny.length}`,
  ].join('\n')
}
