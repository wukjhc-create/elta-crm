/**
 * 00222 (PE-1/PE-2) på staging: arbejdsordre-avance fra samme kilder som sags-økonomien + friske snapshots.
 * Probe-data ryddes i finally.
 *
 *   P1  materialer på ordren tæller som kost (før: kun via source_offer_id → 0)
 *   P2  planlagt omsætning = timernes frosne sale_amount + fakturerbare materialer til salgspris
 *   P3  kladde-faktura tæller ikke som omsætning
 *   P4  udstedt faktura − kreditnota = netto omsætning
 *   P5  "udført" giver snapshot; materiale tilføjet EFTER udført giver nyt snapshot ('recompute')
 *   P6  uændrede tal (faktura markeret betalt) giver intet nyt snapshot
 *   P7  kreditnota på udført ordre giver nyt snapshot med lavere omsætning
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface WoProfitCheck { id: string; ok: boolean; note: string }

type Calc = { revenue: number; total_cost: number; material_cost: number; other_cost: number; labor_cost: number; revenue_source: string }

export async function runWoProfit(c: { admin: SupabaseClient }): Promise<WoProfitCheck[]> {
  const out: WoProfitCheck[] = []
  const a = c.admin
  const stamp = Date.now()
  const ids = { cust: '', caseId: '', wo: '', emp: '', tl: '', mats: [] as string[], ocs: [] as string[], invs: [] as string[] }
  const calc = async () => {
    const { data, error } = await a.rpc('calculate_work_order_profit', { p_work_order_id: ids.wo })
    if (error) throw new Error(`rpc: ${error.message}`)
    const d = data as Record<string, unknown>
    return { revenue: Number(d.revenue), total_cost: Number(d.total_cost), material_cost: Number(d.material_cost), other_cost: Number(d.other_cost), labor_cost: Number(d.labor_cost), revenue_source: String(d.revenue_source) } as Calc
  }
  const snaps = async () => ((await a.from('work_order_profit').select('revenue, total_cost, source').eq('work_order_id', ids.wo).order('created_at')).data ?? []) as Array<{ revenue: number; total_cost: number; source: string }>
  const addMat = async (cost: number, sale: number) => {
    const r = await a.from('case_materials').insert([{ case_id: ids.caseId, work_order_id: ids.wo, description: `[HARNESS] P ${stamp}`, quantity: 1, unit: 'stk',
      unit_cost: cost, unit_sales_price: sale, billable: true, source: 'manual' }]).select('id')
    if (r.error) throw new Error(`case_materials: ${r.error.message}`)
    ids.mats.push((r.data?.[0] as { id: string }).id)
  }
  // Højst én faktura pr. arbejdsordre (uq_invoices_work_order); kreditnotaer har ingen work_order_id (som invoice-credit.ts)
  const addInv = async (status: string, total: number, extra: Record<string, unknown> = {}) => {
    const r = await a.from('invoices').insert([{ invoice_number: `H222-${stamp}-${ids.invs.length}`, customer_id: ids.cust, case_id: ids.caseId,
      work_order_id: extra.invoice_type === 'credit' ? null : ids.wo, status, total_amount: total, tax_amount: Math.round(total * 25) / 100, final_amount: Math.round(total * 125) / 100, ...extra }]).select('id')
    if (r.error) throw new Error(`invoices: ${r.error.message}`)
    const id = (r.data?.[0] as { id: string }).id
    ids.invs.push(id)
    return id
  }
  try {
    const owner = ((await a.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).limit(1)).data as Array<{ id: string }>)[0].id
    ids.cust = ((await a.from('customers').insert({ customer_number: `P222-${stamp}`, company_name: `[HARNESS] 00222 ${stamp}`, contact_person: 'X', email: `p222-${stamp}@harness.test`, created_by: owner }).select('id').single()).data as { id: string }).id
    ids.caseId = ((await a.from('service_cases').insert({ case_number: `SVC-5${String(stamp).slice(-6)}`, customer_id: ids.cust, title: '[HARNESS] 00222', status: 'in_progress', created_by: owner }).select('id').single()).data as { id: string }).id
    ids.emp = ((await a.from('employees').insert({ name: '[HARNESS] 00222', email: `p222e-${stamp}@harness.test`, role: 'montør', active: true }).select('id').single()).data as { id: string }).id
    ids.wo = ((await a.from('work_orders').insert({ case_id: ids.caseId, customer_id: ids.cust, title: '[HARNESS] 00222', status: 'in_progress', scheduled_date: '2026-10-01', assigned_employee_id: ids.emp }).select('id').single()).data as { id: string }).id
    const tl = await a.from('time_logs').insert({ work_order_id: ids.wo, employee_id: ids.emp, start_time: '2026-10-01T06:00:00Z', end_time: '2026-10-01T10:00:00Z', billable: true }).select('id, cost_amount, sale_amount').single()
    if (tl.error) throw new Error(`time_log: ${tl.error.message}`)
    const t = tl.data as { id: string; cost_amount: number | null; sale_amount: number | null }
    ids.tl = t.id
    const tlCost = Number(t.cost_amount ?? 0)
    const tlSale = Number(t.sale_amount ?? 0)

    await addMat(600, 1000)
    // øvrig omkostning på ordren (kost 200, fakturerbar til 300)
    const oc = await a.from('case_other_costs').insert([{ case_id: ids.caseId, work_order_id: ids.wo, category: 'parkering', description: `[HARNESS] P oc ${stamp}`, quantity: 1, unit: 'stk',
      unit_cost: 200, unit_sales_price: 300, billable: true, source: 'manual', cost_date: '2026-10-01' }]).select('id')
    if (oc.error) throw new Error(`case_other_costs: ${oc.error.message}`)
    ids.ocs.push((oc.data?.[0] as { id: string }).id)
    const c1 = await calc()
    out.push({ id: 'P1 materialer + øvrige på ordren = kost', ok: c1.material_cost === 600 && c1.other_cost === 200 && c1.total_cost === Math.round((tlCost + 600 + 200) * 100) / 100,
      note: `materialer ${c1.material_cost} · øvrige ${c1.other_cost} · kost ${c1.total_cost} (timer ${tlCost})` })
    out.push({ id: 'P2 planlagt omsætning = frossen timesalg + materiale-/øvrig salg', ok: c1.revenue_source === 'planned' && c1.revenue === Math.round((tlSale + 1000 + 300) * 100) / 100,
      note: `${c1.revenue_source} ${c1.revenue} (timer ${tlSale} + 1000 + 300)` })

    const inv = await addInv('draft', 2000)
    const c2 = await calc()
    out.push({ id: 'P3 kladde tæller ikke', ok: c2.revenue_source === 'planned' && c2.revenue === c1.revenue, note: `${c2.revenue_source} ${c2.revenue}` })

    await a.from('invoices').update({ status: 'sent' }).eq('id', inv)
    await addInv('sent', -500, { invoice_type: 'credit', credit_of_invoice_id: inv })
    const c3 = await calc()
    out.push({ id: 'P4 udstedt − kreditnota', ok: c3.revenue_source === 'invoice' && c3.revenue === 1500, note: `${c3.revenue_source} ${c3.revenue}` })

    await a.from('work_orders').update({ status: 'done' }).eq('id', ids.wo)
    const s1 = await snaps()
    await addMat(100, 0)
    const s2 = await snaps()
    const lastS2 = s2[s2.length - 1]
    out.push({ id: 'P5 snapshot ved udført + ved ny kost efter udført', ok: s1.length >= 1 && s2.length === s1.length + 1 && lastS2?.source === 'recompute' && Number(lastS2.total_cost) === Number(s1[s1.length - 1].total_cost) + 100,
      note: `snapshots ${s1.length} → ${s2.length} (${lastS2?.source ?? '-'}, kost ${lastS2?.total_cost ?? '-'})` })

    await a.from('invoices').update({ status: 'paid' }).eq('id', inv)
    const s3 = await snaps()
    out.push({ id: 'P6 uændrede tal → intet nyt snapshot', ok: s3.length === s2.length, note: `${s2.length} → ${s3.length}` })

    const cn = await addInv('draft', -300, { invoice_type: 'credit', credit_of_invoice_id: inv })
    await a.from('invoices').update({ status: 'sent' }).eq('id', cn) // kladde → sendt (som appen)
    const s4 = await snaps()
    const lastS4 = s4[s4.length - 1]
    out.push({ id: 'P7 kreditnota udstedt på udført ordre → nyt snapshot', ok: s4.length === s3.length + 1 && Number(lastS4?.revenue) === 1200,
      note: `${s3.length} → ${s4.length}, omsætning ${lastS4?.revenue ?? '-'}` })
    // P8 lav-avance-flag (trg_profit_snapshot_flag_low, < 15 %): omsætning 1.200 mod kost > 2.000 → flag sat; ny faktura-
    // omsætning der giver høj avance → flag fjernet
    const low1 = ((await a.from('work_orders').select('low_profit').eq('id', ids.wo).single()).data as { low_profit: boolean }).low_profit
    await a.from('invoices').update({ total_amount: 20000, tax_amount: 5000, final_amount: 25000 }).eq('id', inv)
    const low2 = ((await a.from('work_orders').select('low_profit').eq('id', ids.wo).single()).data as { low_profit: boolean }).low_profit
    out.push({ id: 'P8 lav-avance-flag sættes og fjernes', ok: low1 === true && low2 === false, note: `efter kreditnota=${low1} · efter høj omsætning=${low2}` })
  } finally {
    if (ids.wo) {
      await a.from('ai_suggestions').delete().eq('entity_id', ids.wo)
      await a.from('work_order_profit').delete().eq('work_order_id', ids.wo)
    }
    for (const id of [...ids.invs].reverse()) await a.from('invoices').delete().eq('id', id)
    for (const id of ids.mats) await a.from('case_materials').delete().eq('id', id)
    for (const id of ids.ocs) await a.from('case_other_costs').delete().eq('id', id)
    if (ids.tl) await a.from('time_logs').delete().eq('id', ids.tl)
    if (ids.wo) { await a.from('work_order_profit').delete().eq('work_order_id', ids.wo); await a.from('work_orders').delete().eq('id', ids.wo) }
    if (ids.caseId) await a.from('service_cases').delete().eq('id', ids.caseId)
    if (ids.cust) await a.from('customers').delete().eq('id', ids.cust)
    if (ids.emp) await a.from('employees').delete().eq('id', ids.emp)
  }
  return out
}

export function formatWoProfit(checks: WoProfitCheck[]): string {
  const bad = checks.filter((c) => !c.ok).length
  return [...checks.map((c) => `${c.ok ? 'PASS' : 'FAIL'}  ${c.id} — ${c.note}`), bad ? `❌ ${bad} fejl` : `✅ 00222 ${checks.length}/${checks.length}`].join('\n')
}
