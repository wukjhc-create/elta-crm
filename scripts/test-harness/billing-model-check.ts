/**
 * 00232 (Henrik 2026-10-15) på staging: slutfakturaen følger sagens VALGTE afregningsform.
 *   B1  kontraktsag UDEN valgt afregningsform → slutfaktura blokeret (intet gæt), ingen faktura
 *   B2  regning (time_and_materials) MED kontraktsum → linjebaseret (godkendte timer + materialer), ikke restbeløb
 *   B3  fast pris → restbeløb af kontraktsum (forskud trukket fra)
 *   B4  fast pris uden kontraktsum → blokeret
 *   B5  sikker backfill: sag uden kontraktsum oprettet før migrationen ville få regning — her: kolonnen findes + CHECK
 * Kør fra main med OUT_MOD=../../../elta-billing/src/lib/services/invoice-stage (worktree-mønster).
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface BmCheck { id: string; ok: boolean; note: string }

export async function runBillingModelCheck(c: { admin: SupabaseClient; sql: (q: string) => Promise<any[]> }): Promise<BmCheck[]> {
  const out: BmCheck[] = []
  const mod = process.env.OUT_MOD || '../../src/lib/services/invoice-stage'
  const { createFinalInvoiceForCase } = (await import(mod)) as typeof import('../../src/lib/services/invoice-stage')
  const admin = c.admin
  const stamp = Date.now()
  const owner = ((await admin.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).limit(1)).data as Array<{ id: string }>)[0].id
  const made = { cust: '', cases: [] as string[], invoices: [] as string[], wos: [] as string[], emp: '', offers: [] as string[] }
  let seq = 0
  const ins = async (t: string, row: Record<string, unknown>) => {
    const { data, error } = await admin.from(t).insert([row]).select('id').single()
    if (error) throw new Error(`seed ${t}: ${error.message}`)
    return (data as { id: string }).id
  }
  const mkCase = async (contract: number | null, model: string | null) => {
    seq++
    const id = await ins('service_cases', { case_number: `SVC-6${String(stamp).slice(-4)}${seq}`, customer_id: made.cust, title: '[HARNESS] afregning', status: 'in_progress', created_by: owner, contract_sum: contract, billing_model: model })
    made.cases.push(id)
    return id
  }
  const mat = (caseId: string) => ins('case_materials', { case_id: caseId, description: '[HARNESS] kabel', quantity: 10, unit: 'm', unit_cost: 10, unit_sales_price: 20, billable: true, source: 'manual', created_by: owner })
  try {
    made.cust = await ins('customers', { customer_number: `HBM-${stamp}`, company_name: `[HARNESS] afregning ${stamp}`, contact_person: 'X', email: `hbm-${stamp}@harness.test`, created_by: owner })

    const k1 = await mkCase(10000, null)
    await mat(k1)
    const r1 = await createFinalInvoiceForCase({ case_id: k1 }, owner)
    if (r1.invoice_id) made.invoices.push(r1.invoice_id)
    out.push({ id: 'B1 kontraktsag uden afregningsform → blokeret', ok: !r1.ok && !r1.invoice_id && /Vælg afregningsform/.test(r1.message), note: r1.message })

    const k2 = await mkCase(10000, 'time_and_materials')
    await mat(k2)
    const r2 = await createFinalInvoiceForCase({ case_id: k2 }, owner)
    if (r2.invoice_id) made.invoices.push(r2.invoice_id)
    out.push({ id: 'B2 regning med kontraktsum → linjer (200), ikke restbeløb (10.000)', ok: r2.ok && r2.total_amount === 200, note: `${r2.message} · total=${r2.total_amount}` })

    const k3 = await mkCase(10000, 'fixed_price')
    await mat(k3)
    const dep = await ins('invoices', { invoice_number: `HBM-${stamp}-d`, customer_id: made.cust, case_id: k3, invoice_type: 'deposit', status: 'sent', total_amount: 3000, tax_amount: 750, final_amount: 3750 })
    made.invoices.push(dep)
    const r3 = await createFinalInvoiceForCase({ case_id: k3 }, owner)
    if (r3.invoice_id) made.invoices.push(r3.invoice_id)
    out.push({ id: 'B3 fast pris → restbeløb 7.000', ok: r3.ok && r3.total_amount === 7000, note: `${r3.message} · total=${r3.total_amount}` })

    const k4 = await mkCase(null, 'fixed_price')
    const r4 = await createFinalInvoiceForCase({ case_id: k4 }, owner)
    if (r4.invoice_id) made.invoices.push(r4.invoice_id)
    out.push({ id: 'B4 fast pris uden kontraktsum → blokeret', ok: !r4.ok && /ingen kontraktsum/.test(r4.message), note: r4.message })

    // F-2 (review 2026-10-16): regning med fakturerbart materiale uden salgspris → blokeret (ellers 0 kr og låst)
    const k6 = await mkCase(null, 'time_and_materials')
    await ins('case_materials', { case_id: k6, description: '[HARNESS] uden pris', quantity: 1, unit: 'stk', unit_cost: 4800, unit_sales_price: 0, billable: true, source: 'manual', created_by: owner })
    const r6 = await createFinalInvoiceForCase({ case_id: k6 }, owner)
    if (r6.invoice_id) made.invoices.push(r6.invoice_id)
    out.push({ id: 'B6 regning: materiale uden salgspris → blokeret', ok: !r6.ok && !r6.invoice_id && /ingen salgspris/.test(r6.message), note: r6.message })

    // F-1: fast pris hvor kontraktsummen = kildetilbuddets beløb INKL. moms → blokeret (ellers 25 % for meget)
    const k7 = await mkCase(12500, 'fixed_price')
    const off = await ins('offers', { offer_number: `HBM-${stamp}-o`, title: '[HARNESS] inkl moms', customer_id: made.cust, status: 'accepted', created_by: owner, total_amount: 10000, tax_amount: 2500, final_amount: 12500, converted_case_id: k7 })
    made.offers.push(off)
    const r7 = await createFinalInvoiceForCase({ case_id: k7 }, owner)
    if (r7.invoice_id) made.invoices.push(r7.invoice_id)
    out.push({ id: 'B7 fast pris: kontraktsum = tilbud inkl. moms → blokeret', ok: !r7.ok && !r7.invoice_id && /INKL\. moms/.test(r7.message), note: r7.message })

    const bad = await admin.from('service_cases').update({ billing_model: 'mixed' }).eq('id', k4).select('id')
    out.push({ id: 'B5 DB afviser ukendt afregningsform', ok: !!bad.error, note: (bad.error as { code?: string } | null)?.code ?? 'tilladt!' })
  } finally {
    if (made.invoices.length) {
      const lineIds = (((await admin.from('invoice_lines').select('id').in('invoice_id', made.invoices)).data ?? []) as Array<{ id: string }>).map((l) => l.id)
      if (lineIds.length) for (const t of ['time_logs', 'case_materials', 'case_other_costs']) await admin.from(t).update({ invoice_line_id: null }).in('invoice_line_id', lineIds)
      await admin.from('invoice_predecessors').delete().in('invoice_id', made.invoices)
      await admin.from('invoice_lines').delete().in('invoice_id', made.invoices)
      await admin.from('invoices').delete().in('id', made.invoices)
    }
    if (made.offers.length) await admin.from('offers').delete().in('id', made.offers)
    if (made.cases.length) { await admin.from('case_materials').delete().in('case_id', made.cases); await admin.from('service_cases').delete().in('id', made.cases) }
    if (made.cust) await admin.from('customers').delete().eq('id', made.cust)
  }
  return out
}

export function formatBillingModelCheck(checks: BmCheck[]): string {
  return ['Afregningsform (00232) — staging', ...checks.map((k) => `  ${k.ok ? 'PASS' : 'FAIL'}  ${k.id} — ${k.note}`)].join('\n')
}
