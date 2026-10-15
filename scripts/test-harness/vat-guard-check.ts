/**
 * PR-10 (Henrik 2026-10-15, midlertidig værn) på staging: sag fra tilbud med 0 % moms må ikke faktureres automatisk
 * med 25 % — kladde, forskud, slutfaktura og faktura fra arbejdsordre blokeres. 25 %-sag faktureres som før.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface VgCheck { id: string; ok: boolean; note: string }

export async function runVatGuardCheck(c: { admin: SupabaseClient }): Promise<VgCheck[]> {
  const out: VgCheck[] = []
  const { vatBlockMessage } = await import('../../src/lib/invoices/vat-guard')
  const { createInvoiceDraftFromCase } = await import('../../src/lib/services/invoice-from-case')
  const { createStageInvoiceForCase, createFinalInvoiceForCase } = await import('../../src/lib/services/invoice-stage')
  const { createInvoiceFromWorkOrder } = await import('../../src/lib/services/invoices')
  const admin = c.admin
  const stamp = Date.now()
  const owner = ((await admin.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).limit(1)).data as Array<{ id: string }>)[0].id
  const made = { cust: '', offers: [] as string[], cases: [] as string[], wos: [] as string[], invoices: [] as string[] }
  const ins = async (t: string, row: Record<string, unknown>) => {
    const { data, error } = await admin.from(t).insert([row]).select('id').single()
    if (error) throw new Error(`seed ${t}: ${error.message}`)
    return (data as { id: string }).id
  }
  out.push({
    id: 'V1 regel: 25 % / intet tilbud ok, 0 % og ugyldig blokerer',
    ok: vatBlockMessage(25) === null && vatBlockMessage('25.00') === null && vatBlockMessage(null) === null && vatBlockMessage(0) !== null && vatBlockMessage('x') !== null,
    note: String(vatBlockMessage(0)).slice(0, 60),
  })
  try {
    made.cust = await ins('customers', { customer_number: `HVG-${stamp}`, company_name: `[HARNESS] moms ${stamp}`, contact_person: 'X', email: `hvg-${stamp}@harness.test`, created_by: owner })
    let seq = 0
    const mkCase = async (tax: number) => {
      seq++
      const off = await ins('offers', { offer_number: `HVG-${stamp}-${tax}-${seq}`, title: '[HARNESS] moms', customer_id: made.cust, status: 'accepted', created_by: owner, tax_percentage: tax })
      made.offers.push(off)
      const cs = await ins('service_cases', { case_number: `SVC-8${String(stamp).slice(-4)}${seq}${tax}`, customer_id: made.cust, title: '[HARNESS] moms', status: 'in_progress', created_by: owner, source_offer_id: off, contract_sum: 1000 })
      made.cases.push(cs)
      const mat = await ins('case_materials', { case_id: cs, description: '[HARNESS] dåse', quantity: 1, unit: 'stk', unit_cost: 50, unit_sales_price: 100, billable: true, source: 'manual', created_by: owner })
      const wo = await ins('work_orders', { title: '[HARNESS] moms', case_id: cs, customer_id: made.cust, status: 'done' })
      made.wos.push(wo)
      return { cs, mat, wo }
    }
    const zero = await mkCase(0)
    const d = await createInvoiceDraftFromCase(zero.cs, owner, { case_material_ids: [zero.mat] }, { vat_rate: 0 })
    if (d.invoice_id) made.invoices.push(d.invoice_id)
    const st = await createStageInvoiceForCase({ case_id: zero.cs, invoice_type: 'deposit', amount_basis: 'contract_sum', billing_percentage: 30 }, owner)
    if (st.invoice_id) made.invoices.push(st.invoice_id)
    const fin = await createFinalInvoiceForCase({ case_id: zero.cs }, owner)
    if (fin.invoice_id) made.invoices.push(fin.invoice_id)
    let woErr = ''
    try { made.invoices.push(await createInvoiceFromWorkOrder(zero.wo, { dueDays: 14 })) } catch (e) { woErr = e instanceof Error ? e.message : String(e) }
    out.push({ id: 'V2 0 %-sag: kladde blokeret', ok: !d.ok && !d.invoice_id && /0 % moms/.test(d.message), note: d.message.slice(0, 80) })
    out.push({ id: 'V3 0 %-sag: forskud blokeret', ok: !st.ok && !st.invoice_id && /0 % moms/.test(st.message), note: st.message.slice(0, 80) })
    out.push({ id: 'V4 0 %-sag: slutfaktura blokeret', ok: !fin.ok && !fin.invoice_id && /0 % moms/.test(fin.message), note: fin.message.slice(0, 80) })
    out.push({ id: 'V5 0 %-sag: faktura fra arbejdsordre blokeret', ok: /0 % moms/.test(woErr), note: woErr.slice(0, 80) || 'oprettet!' })
    const std = await mkCase(25)
    const d2 = await createInvoiceDraftFromCase(std.cs, owner, { case_material_ids: [std.mat] }, { vat_rate: 0 })
    if (d2.invoice_id) made.invoices.push(d2.invoice_id)
    const inv = d2.invoice_id ? ((await admin.from('invoices').select('total_amount, tax_amount').eq('id', d2.invoice_id).single()).data as { total_amount: number; tax_amount: number }) : null
    out.push({ id: 'V6 25 %-sag faktureres; kalderens vat_rate=0 ignoreres (25 %)', ok: d2.ok && Number(inv?.total_amount) === 100 && Number(inv?.tax_amount) === 25, note: `${d2.message} · moms=${inv?.tax_amount}` })
    const invMode = d2.invoice_id ? ((await admin.from('invoices').select('vat_mode, vat_rate').eq('id', d2.invoice_id).single()).data as { vat_mode: string; vat_rate: number }) : null
    out.push({ id: 'V7 25 %-faktura får vat_mode standard_25 / 25', ok: invMode?.vat_mode === 'standard_25' && Number(invMode?.vat_rate) === 25, note: JSON.stringify(invMode) })

    // 00231: eksplicit mode — tilbud med reverse_charge (25 % i procentfeltet) blokeres alligevel
    const rc = await mkCase(25)
    const rcOffer = ((await admin.from('service_cases').select('source_offer_id').eq('id', rc.cs).single()).data as { source_offer_id: string }).source_offer_id
    await admin.from('offers').update({ vat_mode: 'reverse_charge' }).eq('id', rcOffer)
    const d3 = await createInvoiceDraftFromCase(rc.cs, owner, { case_material_ids: [rc.mat] })
    if (d3.invoice_id) made.invoices.push(d3.invoice_id)
    out.push({ id: 'V8 tilbud med omvendt betalingspligt → blokeret', ok: !d3.ok && /omvendt betalingspligt/.test(d3.message), note: d3.message.slice(0, 90) })
    // sag uden tilbud: kundens mode afgør
    await admin.from('customers').update({ vat_mode: 'zero' }).eq('id', made.cust)
    const plain = await ins('service_cases', { case_number: `SVC-8${String(stamp).slice(-5)}9`, customer_id: made.cust, title: '[HARNESS] moms uden tilbud', status: 'in_progress', created_by: owner })
    made.cases.push(plain)
    const pm = await ins('case_materials', { case_id: plain, description: '[HARNESS] dåse', quantity: 1, unit: 'stk', unit_cost: 50, unit_sales_price: 100, billable: true, source: 'manual', created_by: owner })
    const d4 = await createInvoiceDraftFromCase(plain, owner, { case_material_ids: [pm] })
    if (d4.invoice_id) made.invoices.push(d4.invoice_id)
    out.push({ id: 'V9 sag uden tilbud, kunde 0 % → blokeret', ok: !d4.ok && /0 % moms/.test(d4.message), note: d4.message.slice(0, 90) })
    // nyt tilbud arver kundens mode
    const { insertOfferWithNumber } = await import('../../src/lib/services/offer-number')
    const ni = await insertOfferWithNumber(admin, { title: '[HARNESS] arv', customer_id: made.cust, status: 'draft', created_by: owner })
    const nid = (ni.data as { id?: string } | null)?.id
    if (nid) made.offers.push(nid)
    const nm = nid ? ((await admin.from('offers').select('vat_mode').eq('id', nid).single()).data as { vat_mode: string | null }).vat_mode : null
    out.push({ id: 'V10 nyt tilbud arver kundens momsmode', ok: nm === 'zero', note: String(nm) })
    // ugyldig kombination afvises af DB
    const bad = d2.invoice_id ? await admin.from('invoices').update({ vat_mode: 'reverse_charge' }).eq('id', d2.invoice_id).select('id') : { error: null }
    out.push({ id: 'V11 DB afviser reverse_charge med 25 %-sats', ok: !!bad.error, note: (bad.error as { code?: string } | null)?.code ?? 'tilladt!' })
  } finally {
    if (made.invoices.length) {
      const lineIds = (((await admin.from('invoice_lines').select('id').in('invoice_id', made.invoices)).data ?? []) as Array<{ id: string }>).map((l) => l.id)
      if (lineIds.length) await admin.from('case_materials').update({ invoice_line_id: null }).in('invoice_line_id', lineIds)
      await admin.from('invoice_lines').delete().in('invoice_id', made.invoices)
      await admin.from('invoices').delete().in('id', made.invoices)
    }
    for (const w of made.wos) { await admin.from('work_order_profit').delete().eq('work_order_id', w); await admin.from('work_orders').delete().eq('id', w) }
    if (made.cases.length) { await admin.from('case_materials').delete().in('case_id', made.cases); await admin.from('service_cases').delete().in('id', made.cases) }
    if (made.offers.length) await admin.from('offers').delete().in('id', made.offers)
    if (made.cust) await admin.from('customers').delete().eq('id', made.cust)
  }
  return out
}

export function formatVatGuardCheck(checks: VgCheck[]): string {
  return ['Moms-værn (PR-10, midlertidigt) — staging', ...checks.map((k) => `  ${k.ok ? 'PASS' : 'FAIL'}  ${k.id} — ${k.note}`)].join('\n')
}
