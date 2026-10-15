/**
 * PR-6 (Henrik 2026-10-15) på staging: slutfaktura på fastprissag = kontraktsum − tidligere faktureret (netto).
 *   C1  forskud + del-faktura med udstedt kreditnota → restbeløb 10.000 − 3.000 − (2.000 − 500) = 5.500 (ekskl. moms)
 *   C2  linjer: kontraktsum + 2 fradrag; ingen timer/materialer oveni
 *   C3  godkendt time + materiale dækkes af kontraktlinjen (låst) — sagen kan lukkes
 *   C4  fradrag registreret i invoice_predecessors
 *   C5  overfakturering (del-faktura > kontrakt) → blokeret, ingen faktura
 *   C6  allerede fuldt faktureret → blokeret
 *   C7  kladde-forgænger → blokeret
 *   C8  afventende time → blokeret
 *   C9  sag UDEN kontraktsum → almindelig linjebaseret slutfaktura (uændret adfærd)
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface CfCheck { id: string; ok: boolean; note: string }

export async function runContractFinalCheck(c: { admin: SupabaseClient }): Promise<CfCheck[]> {
  const out: CfCheck[] = []
  const { createFinalInvoiceForCase } = await import('../../src/lib/services/invoice-stage')
  const admin = c.admin
  const stamp = Date.now()
  const owner = ((await admin.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).limit(1)).data as Array<{ id: string }>)[0].id
  const created = { cases: [] as string[], invoices: [] as string[], emps: [] as string[], wos: [] as string[], cust: '' }
  let seq = 0
  const ins = async (t: string, row: Record<string, unknown>) => {
    const { data, error } = await admin.from(t).insert([row]).select('id').single()
    if (error) throw new Error(`seed ${t}: ${error.message}`)
    return (data as { id: string }).id
  }
  const mkCase = async (contract: number | null) => {
    const id = await ins('service_cases', { case_number: `SVC-7${String(stamp).slice(-5)}${seq++}`, customer_id: created.cust, title: '[HARNESS] fastpris', status: 'in_progress', created_by: owner, contract_sum: contract })
    created.cases.push(id)
    return id
  }
  const mkInv = async (caseId: string, type: string, total: number, status = 'sent', creditOf: string | null = null) => {
    const id = await ins('invoices', { invoice_number: `HCF-${stamp}-${seq++}`, customer_id: created.cust, case_id: caseId, invoice_type: type, status,
      total_amount: total, tax_amount: Math.round(total * 25) / 100, final_amount: Math.round(total * 125) / 100, credit_of_invoice_id: creditOf })
    created.invoices.push(id)
    return id
  }
  try {
    created.cust = await ins('customers', { customer_number: `HCF-${stamp}`, company_name: `[HARNESS] fastpris ${stamp}`, contact_person: 'X', email: `hcf-${stamp}@harness.test`, created_by: owner })
    const emp = await ins('employees', { name: `[HARNESS] cf ${stamp}`, email: `hcfe-${stamp}@harness.test`, role: 'montør', active: true, hourly_rate: 500 })
    created.emps.push(emp)
    const day = new Date(Date.now() - 2 * 86_400_000)
    const at = (h: number) => new Date(day.getTime() + h * 3_600_000).toISOString()

    // Hovedscenarie
    const k1 = await mkCase(10000)
    await mkInv(k1, 'deposit', 3000)
    const del = await mkInv(k1, 'standard', 2000, 'paid')
    await mkInv(k1, 'credit', -500, 'sent', del)
    const wo = await ins('work_orders', { title: '[HARNESS] cf', case_id: k1, customer_id: created.cust, status: 'done', assigned_employee_id: emp })
    created.wos.push(wo)
    const tl = await ins('time_logs', { employee_id: emp, work_order_id: wo, start_time: at(0), end_time: at(4), billable: true })
    await admin.from('time_logs').update({ approval_status: 'approved', approved_by: owner, approved_at: new Date().toISOString() }).eq('id', tl)
    const mat = await ins('case_materials', { case_id: k1, description: '[HARNESS] kabel', quantity: 10, unit: 'm', unit_cost: 10, unit_sales_price: 15, billable: true, source: 'manual', created_by: owner })
    const r1 = await createFinalInvoiceForCase({ case_id: k1 }, owner)
    if (r1.invoice_id) created.invoices.push(r1.invoice_id)
    out.push({ id: 'C1 restbeløb 5.500 ekskl. moms', ok: r1.ok && r1.total_amount === 5500 && r1.final_amount === 6875, note: `${r1.message} · total=${r1.total_amount} inkl=${r1.final_amount}` })
    const lines = r1.invoice_id ? ((await admin.from('invoice_lines').select('id, position, description, total_price').eq('invoice_id', r1.invoice_id).order('position')).data ?? []) as Array<{ id: string; position: number; description: string; total_price: number }> : []
    out.push({
      id: 'C2 linjer = kontraktsum + 2 fradrag (intet oveni)',
      ok: lines.length === 3 && Number(lines[0].total_price) === 10000 && /Kontraktsum/.test(lines[0].description) && lines.slice(1).map((l) => Number(l.total_price)).sort((x, y) => x - y).join(',') === '-3000,-1500',
      note: lines.map((l) => `${l.description}=${l.total_price}`).join(' | '),
    })
    const tlB = ((await admin.from('time_logs').select('invoice_line_id').eq('id', tl).single()).data as { invoice_line_id: string | null }).invoice_line_id
    const matB = ((await admin.from('case_materials').select('invoice_line_id').eq('id', mat).single()).data as { invoice_line_id: string | null }).invoice_line_id
    out.push({ id: 'C3 time + materiale dækket af kontraktlinjen', ok: !!lines[0] && tlB === lines[0].id && matB === lines[0].id, note: `time=${tlB === lines[0]?.id} materiale=${matB === lines[0]?.id}` })
    const preds = r1.invoice_id ? ((await admin.from('invoice_predecessors').select('deduction_amount').eq('invoice_id', r1.invoice_id)).data ?? []) as Array<{ deduction_amount: number }> : []
    out.push({ id: 'C4 fradrag i invoice_predecessors', ok: preds.length === 2 && preds.reduce((a, p) => a + Number(p.deduction_amount), 0) === 4500, note: `n=${preds.length}` })

    // Overfakturering
    const k2 = await mkCase(1000)
    await mkInv(k2, 'standard', 1200)
    const r2 = await createFinalInvoiceForCase({ case_id: k2 }, owner)
    if (r2.invoice_id) created.invoices.push(r2.invoice_id)
    out.push({ id: 'C5 overfakturering blokeret', ok: !r2.ok && !r2.invoice_id && /200,00 kr mere end kontraktsummen/.test(r2.message), note: r2.message })
    // Fuldt faktureret
    const k3 = await mkCase(1000)
    await mkInv(k3, 'deposit', 400)
    await mkInv(k3, 'progress', 600)
    const r3 = await createFinalInvoiceForCase({ case_id: k3 }, owner)
    if (r3.invoice_id) created.invoices.push(r3.invoice_id)
    out.push({ id: 'C6 fuldt faktureret blokeret', ok: !r3.ok && !r3.invoice_id && /allerede fuldt faktureret/.test(r3.message), note: r3.message })
    // Kladde-forgænger
    const k4 = await mkCase(1000)
    await mkInv(k4, 'deposit', 300, 'draft')
    const r4 = await createFinalInvoiceForCase({ case_id: k4 }, owner)
    if (r4.invoice_id) created.invoices.push(r4.invoice_id)
    out.push({ id: 'C7 kladde-forgænger blokeret', ok: !r4.ok && !r4.invoice_id && /kladde/.test(r4.message), note: r4.message })
    // Afventende time
    const k5 = await mkCase(1000)
    const wo5 = await ins('work_orders', { title: '[HARNESS] cf5', case_id: k5, customer_id: created.cust, status: 'done', assigned_employee_id: emp })
    created.wos.push(wo5)
    await ins('time_logs', { employee_id: emp, work_order_id: wo5, start_time: at(5), end_time: at(6), billable: true })
    const r5 = await createFinalInvoiceForCase({ case_id: k5 }, owner)
    if (r5.invoice_id) created.invoices.push(r5.invoice_id)
    out.push({ id: 'C8 afventende time blokerer', ok: !r5.ok && !r5.invoice_id && /afventer godkendelse/.test(r5.message), note: r5.message })
    // Ingen kontraktsum → linjebaseret
    const k6 = await mkCase(null)
    await ins('case_materials', { case_id: k6, description: '[HARNESS] dåse', quantity: 2, unit: 'stk', unit_cost: 50, unit_sales_price: 100, billable: true, source: 'manual', created_by: owner })
    const r6 = await createFinalInvoiceForCase({ case_id: k6 }, owner)
    if (r6.invoice_id) created.invoices.push(r6.invoice_id)
    out.push({ id: 'C9 uden kontraktsum = linjebaseret (uændret)', ok: r6.ok && r6.total_amount === 200, note: `${r6.message} · total=${r6.total_amount}` })
  } finally {
    const invIds = created.invoices
    if (invIds.length) {
      const lineIds = (((await admin.from('invoice_lines').select('id').in('invoice_id', invIds)).data ?? []) as Array<{ id: string }>).map((l) => l.id)
      if (lineIds.length) for (const t of ['time_logs', 'case_materials', 'case_other_costs']) await admin.from(t).update({ invoice_line_id: null }).in('invoice_line_id', lineIds)
      await admin.from('invoice_predecessors').delete().in('invoice_id', invIds)
      await admin.from('invoice_lines').delete().in('invoice_id', invIds)
      // kreditnotaer før originaler
      await admin.from('invoices').delete().in('id', invIds).eq('invoice_type', 'credit')
      await admin.from('invoices').delete().in('id', invIds)
    }
    for (const w of created.wos) { await admin.from('work_order_profit').delete().eq('work_order_id', w); await admin.from('time_logs').delete().eq('work_order_id', w); await admin.from('work_orders').delete().eq('id', w) }
    if (created.cases.length) await admin.from('case_materials').delete().in('case_id', created.cases)
    if (created.cases.length) await admin.from('service_cases').delete().in('id', created.cases)
    for (const e of created.emps) await admin.from('employees').delete().eq('id', e)
    if (created.cust) await admin.from('customers').delete().eq('id', created.cust)
  }
  return out
}

export function formatContractFinalCheck(checks: CfCheck[]): string {
  return ['Slutfaktura på fastprissag (PR-6) — staging', ...checks.map((k) => `  ${k.ok ? 'PASS' : 'FAIL'}  ${k.id} — ${k.note}`)].join('\n')
}
