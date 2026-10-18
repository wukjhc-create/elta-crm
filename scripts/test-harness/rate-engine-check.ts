/**
 * 00230 (Henrik 2026-10-15) på staging: sats-motoren uden skjult 495/400.
 *   R1  montør registrerer tid → snapshot bruger medarbejderens RIGTIGE satser (salg = timepris, kost = real/intern kost)
 *       uanset at montøren ikke selv kan se kostsatserne (RLS)
 *   R2  medarbejder uden timepris → INSERT fejler med dansk besked med navnet; intet gemt (ingen 0/400/495)
 *   R3  medarbejder uden kostpris → fejler med dansk besked (kost)
 *   R4  eksisterende frosset snapshot røres ikke af godkendelse/fakturabinding
 *   R5  funktions-ACL: compute_time_log_rates kan ikke kaldes af anon/authenticated (ingen sats-lækage via RPC)
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface ReCheck { id: string; ok: boolean; note: string }

export async function runRateEngineCheck(c: { admin: SupabaseClient; url: string; anonKey: string; sql: (q: string) => Promise<any[]> }): Promise<ReCheck[]> {
  const out: ReCheck[] = []
  const { loginPersonas } = await import('./role-matrix')
  const p = await loginPersonas({ url: c.url, anonKey: c.anonKey, admin: c.admin })
  const montor = p.get('montør')!
  const montorUid = (await montor.auth.getUser()).data.user?.id ?? null
  const stamp = Date.now()
  const made = { emps: [] as string[], logs: [] as string[], wo: '', cs: '', cust: '' }
  const owner = ((await c.admin.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).limit(1)).data as Array<{ id: string }>)[0].id
  const ins = async (t: string, row: Record<string, unknown>) => {
    const { data, error } = await c.admin.from(t).insert([row]).select('id').single()
    if (error) throw new Error(`seed ${t}: ${error.message}`)
    return (data as { id: string }).id
  }
  const day = new Date(Date.now() - 3 * 86_400_000)
  const at = (h: number) => new Date(day.getTime() + h * 3_600_000).toISOString()
  // montørens egen medarbejder (personaen) — sæt kendte satser midlertidigt og genskab bagefter
  const own = montorUid ? (((await c.admin.from('employees').select('id, hourly_rate, cost_rate').eq('profile_id', montorUid).limit(1)).data ?? [])[0] as { id: string; hourly_rate: number | null; cost_rate: number | null } | undefined) : undefined
  let ownId = own?.id ?? null
  const prevOwn = own ? { hourly_rate: own.hourly_rate, cost_rate: own.cost_rate } : null
  try {
    if (!ownId) { ownId = await ins('employees', { name: `[HARNESS] sats ${stamp}`, email: `sats-${stamp}@harness.test`, role: 'montør', active: true, profile_id: montorUid }); made.emps.push(ownId) }
    await c.admin.from('employees').update({ hourly_rate: 610, cost_rate: 333 }).eq('id', ownId)
    made.cust = await ins('customers', { customer_number: `HRE-${stamp}`, company_name: `[HARNESS] sats ${stamp}`, contact_person: 'X', email: `hre-${stamp}@harness.test`, created_by: owner })
    made.cs = await ins('service_cases', { case_number: `SVC-9${String(stamp).slice(-5)}`, customer_id: made.cust, title: '[HARNESS] sats', status: 'in_progress', created_by: owner })
    made.wo = await ins('work_orders', { title: '[HARNESS] sats', case_id: made.cs, customer_id: made.cust, status: 'in_progress', assigned_employee_id: ownId })

    // R1: montørens egen klient indsætter
    const r1 = await montor.from('time_logs').insert([{ employee_id: ownId, work_order_id: made.wo, start_time: at(0), end_time: at(2), billable: true }]).select('id').single()
    if (r1.data) made.logs.push((r1.data as { id: string }).id)
    const snap = r1.data ? ((await c.admin.from('time_logs').select('sale_rate_snapshot, cost_rate_snapshot').eq('id', (r1.data as { id: string }).id).single()).data as { sale_rate_snapshot: number; cost_rate_snapshot: number }) : null
    const basis = (await c.sql(`SELECT time_cost_basis FROM company_settings ORDER BY created_at NULLS LAST LIMIT 1`))[0]?.time_cost_basis ?? 'real_hourly_cost'
    out.push({ id: 'R1 montør: rigtige satser i snapshot', ok: !r1.error && Number(snap?.sale_rate_snapshot) === 610 && Number(snap?.cost_rate_snapshot) > 0 && Number(snap?.cost_rate_snapshot) !== 400, note: `${r1.error?.message ?? ''} salg=${snap?.sale_rate_snapshot} kost=${snap?.cost_rate_snapshot} (basis ${basis})` })

    // R2: uden timepris
    const noSale = await ins('employees', { name: `[HARNESS] Uden Sats ${stamp}`, email: `us-${stamp}@harness.test`, role: 'montør', active: true, hourly_rate: null, cost_rate: 300 })
    made.emps.push(noSale)
    const r2 = await c.admin.from('time_logs').insert([{ employee_id: noSale, work_order_id: made.wo, start_time: at(3), end_time: at(4), billable: true }]).select('id')
    if ((r2.data ?? []).length) made.logs.push(...(r2.data as Array<{ id: string }>).map((x) => x.id))
    out.push({ id: 'R2 uden timepris → fejl med navn, intet gemt', ok: !!r2.error && /Uden Sats .* mangler timepris/.test(r2.error.message) && !(r2.data ?? []).length, note: r2.error?.message ?? 'gemt!' })

    // R3: uden kostpris (ingen kostsats overhovedet)
    const noCost = await ins('employees', { name: `[HARNESS] Uden Kost ${stamp}`, email: `uk-${stamp}@harness.test`, role: 'montør', active: true, hourly_rate: 500, cost_rate: null })
    made.emps.push(noCost)
    const fixed = (await c.sql(`SELECT time_cost_basis b, time_cost_rate f FROM company_settings ORDER BY created_at NULLS LAST LIMIT 1`))[0]
    const r3 = await c.admin.from('time_logs').insert([{ employee_id: noCost, work_order_id: made.wo, start_time: at(5), end_time: at(6), billable: true }]).select('id')
    if ((r3.data ?? []).length) made.logs.push(...(r3.data as Array<{ id: string }>).map((x) => x.id))
    const fixedBasis = fixed?.b === 'fixed_standard_rate' && fixed?.f != null
    out.push({
      id: 'R3 uden kostpris → fejl (medmindre firmaet bruger fast standardsats)',
      ok: fixedBasis ? !r3.error : (!!r3.error && /Uden Kost .* mangler kostpris/.test(r3.error.message)),
      note: `basis=${fixed?.b ?? '-'} · ${r3.error?.message ?? 'gemt'}`,
    })

    // R4: frosset snapshot uændret ved godkendelse + binding
    if (made.logs[0]) {
      const before = (await c.admin.from('time_logs').select('sale_rate_snapshot, cost_rate_snapshot, sale_amount').eq('id', made.logs[0]).single()).data
      await c.admin.from('employees').update({ hourly_rate: 999 }).eq('id', ownId)
      await c.admin.from('time_logs').update({ approval_status: 'approved', approved_by: owner, approved_at: new Date().toISOString() }).eq('id', made.logs[0])
      const after = (await c.admin.from('time_logs').select('sale_rate_snapshot, cost_rate_snapshot, sale_amount').eq('id', made.logs[0]).single()).data
      out.push({ id: 'R4 frosset snapshot uændret ved godkendelse', ok: JSON.stringify(before) === JSON.stringify(after), note: `${JSON.stringify(before)} → ${JSON.stringify(after)}` })
    }

    // R6 (TT-1): triggeren genberegner ikke ved kun start_time — med end_time i SET-listen passer beløbet til timerne igen
    if (made.logs[0]) {
      const read = async () => (await c.admin.from('time_logs').select('start_time, end_time, hours, sale_amount, sale_rate_snapshot').eq('id', made.logs[0]).single()).data as { start_time: string; end_time: string; hours: number; sale_amount: number; sale_rate_snapshot: number }
      const b = await read()
      const later = new Date(new Date(b.start_time).getTime() + 3_600_000).toISOString()
      await c.admin.from('time_logs').update({ start_time: later }).eq('id', made.logs[0])
      const onlyStart = await read()
      await c.admin.from('time_logs').update({ start_time: later, end_time: b.end_time }).eq('id', made.logs[0])
      const withEnd = await read()
      const fits = (x: { hours: number; sale_amount: number; sale_rate_snapshot: number }) => Math.abs(Number(x.hours) * Number(x.sale_rate_snapshot) - Number(x.sale_amount)) < 0.01
      out.push({ id: 'R6 kun start_time genberegner ikke; start+end gør (TT-1-præmis)', ok: !fits(onlyStart) && fits(withEnd),
        note: `kun start: ${onlyStart.hours} t / ${onlyStart.sale_amount} kr · med end: ${withEnd.hours} t / ${withEnd.sale_amount} kr (sats ${withEnd.sale_rate_snapshot})` })
    }

    // R5: ACL
    const acl = await c.sql(`SELECT has_function_privilege('anon', 'public.compute_time_log_rates(uuid,text,uuid)', 'EXECUTE') a, has_function_privilege('authenticated', 'public.compute_time_log_rates(uuid,text,uuid)', 'EXECUTE') u`)
    out.push({ id: 'R5 compute_time_log_rates ikke kaldbar af anon/authenticated', ok: acl[0]?.a === false && acl[0]?.u === false, note: JSON.stringify(acl[0]) })
  } finally {
    if (made.logs.length) await c.admin.from('time_logs').delete().in('id', made.logs)
    if (made.wo) { await c.admin.from('work_order_profit').delete().eq('work_order_id', made.wo); await c.admin.from('work_orders').delete().eq('id', made.wo) }
    if (made.cs) await c.admin.from('service_cases').delete().eq('id', made.cs)
    if (made.cust) await c.admin.from('customers').delete().eq('id', made.cust)
    for (const e of made.emps) await c.admin.from('employees').delete().eq('id', e)
    if (ownId && prevOwn) await c.admin.from('employees').update(prevOwn).eq('id', ownId)
  }
  return out
}

export function formatRateEngineCheck(checks: ReCheck[]): string {
  return ['Sats-motor (00230) — staging', ...checks.map((k) => `  ${k.ok ? 'PASS' : 'FAIL'}  ${k.id} — ${k.note}`)].join('\n')
}
