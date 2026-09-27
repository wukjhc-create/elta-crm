/**
 * Regressionsvaern for rest-risici R1–R4 (migration 00161) — KUN staging.
 *
 * Seeder en realistisk probe-kaede som admin (service-role), maaler hvad hver rigtig rolle (pilot-personaer) ser og
 * kan skrive via sin egen JWT, sammenligner med den besluttede model og rydder ALTID op. Probe-raekker betyder at
 * "0 synlige" aldrig kan vaere en falsk PASS paa grund af tomme tabeller.
 *
 *   R1  fakturaer/betalinger: admin/serviceleder/bogholderi alt; salg kun paa sager salg har oprettet; montør intet
 *   R2  tidsregistreringer: view.all-roller alt; montør egne + paa egne arbejdsordrer; salg paa egne sager;
 *       montør maa kun skrive paa egen medarbejder + egen arbejdsordre
 *   R3  supplier_credentials: ingen authenticated-rolle maa laese credentials_encrypted; metadata maa laeses
 *   R4  v_recent_audit_logs: ikke-admin ser ikke andres audit-raekker
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { PILOT_ROLES, type PilotRole } from './role-matrix'

export interface ResidualCheck { id: string; role: PilotRole | '-'; expected: string; actual: string; ok: boolean }

type Row = Record<string, unknown>

export async function runResidualProbes(admin: SupabaseClient, clients: Map<PilotRole, SupabaseClient>): Promise<ResidualCheck[]> {
  const uid: Partial<Record<PilotRole, string>> = {}
  for (const r of PILOT_ROLES) uid[r] = (await clients.get(r)!.auth.getUser()).data.user?.id
  if (PILOT_ROLES.some((r) => !uid[r])) throw new Error('persona-uid mangler')

  const stamp = Date.now()
  const cleanup: Array<() => PromiseLike<unknown>> = []
  const ins = async (table: string, row: Row): Promise<string> => {
    const { data, error } = await admin.from(table).insert([row]).select('id')
    const id = (data?.[0] as { id?: string } | undefined)?.id
    if (error || !id) throw new Error(`seed ${table}: ${error?.message}`)
    cleanup.unshift(() => admin.from(table).delete().eq('id', id))
    return id
  }
  const out: ResidualCheck[] = []
  const check = (id: string, role: PilotRole | '-', expected: unknown, actual: unknown) =>
    out.push({ id, role, expected: String(expected), actual: String(actual), ok: String(expected) === String(actual) })

  try {
    // ---- seed
    const caseSalg = await ins('service_cases', { title: `[HARNESS-SEC] salg-sag ${stamp}`, created_by: uid.salg })
    const caseOther = await ins('service_cases', { title: `[HARNESS-SEC] anden sag ${stamp}`, created_by: uid.admin })
    const invSalg = await ins('invoices', { invoice_number: `HARNESS-SEC-R1A-${stamp}`, case_id: caseSalg })
    const invOther = await ins('invoices', { invoice_number: `HARNESS-SEC-R1B-${stamp}`, case_id: caseOther })
    const paySalg = await ins('invoice_payments', { invoice_id: invSalg, amount: 1 })
    const payOther = await ins('invoice_payments', { invoice_id: invOther, amount: 1 })
    const empMontor = await ins('employees', { name: 'HARNESS-SEC montør', email: `harness-sec-montor-${stamp}@harness.test`, profile_id: uid['montør'], active: true })
    const empOther = await ins('employees', { name: 'HARNESS-SEC anden', email: `harness-sec-anden-${stamp}@harness.test`, active: true })
    const woMontor = await ins('work_orders', { title: `[HARNESS-SEC] montørs ordre ${stamp}`, case_id: caseOther, assigned_employee_id: empMontor })
    const woSalg = await ins('work_orders', { title: `[HARNESS-SEC] salg-sagens ordre ${stamp}`, case_id: caseSalg, assigned_employee_id: empOther })
    const woForeign = await ins('work_orders', { title: `[HARNESS-SEC] fremmed ordre ${stamp}`, case_id: caseOther, assigned_employee_id: empOther })
    const t = (h: number) => ({ start_time: new Date(Date.UTC(2026, 0, 5, h)).toISOString(), end_time: new Date(Date.UTC(2026, 0, 5, h + 1)).toISOString() })
    const tlMontor = await ins('time_logs', { employee_id: empMontor, work_order_id: woMontor, ...t(7) })
    const tlSalgCase = await ins('time_logs', { employee_id: empOther, work_order_id: woSalg, ...t(9) })
    const tlForeign = await ins('time_logs', { employee_id: empOther, work_order_id: woForeign, ...t(11) })
    const supplier = await ins('suppliers', { name: `HARNESS-SEC leverandør ${stamp}`, code: `HSEC${stamp}` })
    const cred = await ins('supplier_credentials', { supplier_id: supplier, credential_type: 'api', credentials_encrypted: 'harness-sec-ciphertext', is_active: true })
    const audit = await ins('audit_logs', { user_id: uid.admin, entity_type: 'harness_sec_probe', action: 'probe' })

    const seen = async (role: PilotRole, table: string, ids: string[]) =>
      ((await clients.get(role)!.from(table).select('id').in('id', ids)).data ?? []).map((r: { id: string }) => r.id)

    for (const role of PILOT_ROLES) {
      // ---- R1
      const inv = await seen(role, 'invoices', [invSalg, invOther])
      const expInv = role === 'montør' ? [] : role === 'salg' ? [invSalg] : [invSalg, invOther]
      check('R1 fakturaer', role, expInv.length === 0 ? '-' : expInv.map((x) => (x === invSalg ? 'egen-sag' : 'anden-sag')).join('+'),
        inv.length === 0 ? '-' : [invSalg, invOther].filter((x) => inv.includes(x)).map((x) => (x === invSalg ? 'egen-sag' : 'anden-sag')).join('+'))
      const pay = await seen(role, 'invoice_payments', [paySalg, payOther])
      check('R1 betalinger', role, expInv.length, pay.length)
      // ---- R2 laes
      const tl = await seen(role, 'time_logs', [tlMontor, tlSalgCase, tlForeign])
      const expTl = role === 'montør' ? [tlMontor] : role === 'salg' ? [tlSalgCase] : [tlMontor, tlSalgCase, tlForeign]
      const name = (x: string) => (x === tlMontor ? 'montørs' : x === tlSalgCase ? 'salg-sag' : 'fremmed')
      check('R2 tidsregistreringer', role, expTl.map(name).join('+'), [tlMontor, tlSalgCase, tlForeign].filter((x) => tl.includes(x)).map(name).join('+') || '-')
      // ---- R3
      const secret = await clients.get(role)!.from('supplier_credentials').select('credentials_encrypted').eq('id', cred)
      check('R3 laes hemmelighed', role, 'afvist', secret.error ? 'afvist' : `${(secret.data ?? []).length} raekke(r) med ciphertext`)
      const meta = await clients.get(role)!.from('supplier_credentials').select('id, credential_type, is_active').eq('id', cred)
      check('R3 laes metadata', role, 1, meta.error ? 'fejl' : (meta.data ?? []).length)
      // ---- R4
      const av = await clients.get(role)!.from('v_recent_audit_logs').select('id').eq('id', audit)
      check('R4 andres audit via view', role, role === 'admin' ? 1 : 0, av.error ? 0 : (av.data ?? []).length)
    }

    // ---- R2 skriv (montør): egen medarbejder + egen ordre OK; ellers afvist. salg afvist.
    const tryInsert = async (role: PilotRole, employee: string, wo: string, h: number) => {
      const { data } = await clients.get(role)!.from('time_logs').insert([{ employee_id: employee, work_order_id: wo, ...t(h) }]).select('id')
      const id = (data?.[0] as { id?: string } | undefined)?.id
      if (id) await admin.from('time_logs').delete().eq('id', id)
      return id ? 'tilladt' : 'afvist'
    }
    check('R2 skriv egen medarbejder+egen ordre', 'montør', 'tilladt', await tryInsert('montør', empMontor, woMontor, 13))
    check('R2 skriv anden medarbejder', 'montør', 'afvist', await tryInsert('montør', empOther, woMontor, 14))
    check('R2 skriv fremmed ordre', 'montør', 'afvist', await tryInsert('montør', empMontor, woForeign, 15))
    check('R2 skriv', 'salg', 'afvist', await tryInsert('salg', empOther, woSalg, 16))
    check('R2 skriv', 'serviceleder', 'tilladt', await tryInsert('serviceleder', empOther, woForeign, 17))
  } finally {
    for (const c of cleanup) await c()
  }
  return out
}

export function formatResidualChecks(checks: ResidualCheck[]): string {
  const lines = ['', 'REST-RISICI R1–R4 (probe-data, forventet model):']
  for (const c of checks) lines.push(`  ${c.ok ? '✓' : '❌'} ${c.id.padEnd(36)} ${String(c.role).padEnd(12)} forventet=${c.expected.padEnd(22)} faktisk=${c.actual}`)
  const bad = checks.filter((c) => !c.ok).length
  lines.push(bad ? `  ❌ ${bad} afvigelse(r)` : `  ✅ alle ${checks.length} checks som forventet`)
  return lines.join('\n')
}
