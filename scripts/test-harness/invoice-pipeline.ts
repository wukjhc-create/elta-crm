/**
 * P3 #19 — leverandoerfaktura-pipelinen paa staging (probe-fakturaer, ryddes i finally). Ingen e-conomic:
 * I4 koerer KUN hvis staging ikke har en aktiv regnskabsintegration (ellers springes det over).
 *
 *   I1  dublet via leverandoer + fakturanummer findes (foer: matcheren fandt altid fakturaen selv paa file_hash)
 *   I2  en faktura er ikke dublet af sig selv
 *   I3  reparse af en godkendt faktura afvises; status uaendret (foer: blev sendt tilbage i koeen)
 *   I4  3x parallel godkendelse: praecis én vinder; de andre faar konflikt (foer: alle "ok" + e-conomic-forsoeg)
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface InvCheck { id: string; ok: boolean; note: string }

export async function runInvoicePipeline(c: { admin: SupabaseClient; ownerUid: string }): Promise<InvCheck[]> {
  const out: InvCheck[] = []
  const { matchSupplierInvoice } = await import('../../src/lib/services/incoming-invoice-matcher')
  const { parseAndMatch, approveInvoice } = await import('../../src/lib/services/incoming-invoices')
  const stamp = Date.now()
  const created: Array<{ table: string; id: string }> = []
  const ins = async (table: string, row: Record<string, unknown>) => {
    const { data, error } = await c.admin.from(table).insert([row]).select('id')
    const id = (data?.[0] as { id?: string } | undefined)?.id
    if (error || !id) throw new Error(`seed ${table}: ${error?.message}`)
    created.unshift({ table, id })
    return id
  }
  try {
    const supplierName = `HARNESS Faktura Leverandør ${stamp}`
    const supplierId = await ins('suppliers', { name: supplierName, code: `HSINV${stamp}` })
    const invNo = `HARN-${stamp}`
    const base = { source: 'manual', supplier_id: supplierId, invoice_number: invNo, amount_incl_vat: 100, status: 'awaiting_approval', parse_status: 'parsed', raw_text: '' }
    const a = await ins('incoming_invoices', { ...base, file_hash: `harness-a-${stamp}` })
    const b = await ins('incoming_invoices', { ...base, file_hash: `harness-b-${stamp}`, invoice_number: null })

    const input = { supplierName, supplierVatNumber: null, invoiceNumber: invNo, workOrderHints: [], supplierOrderRefs: [], deliveryAddressHints: [] }
    const mB = await matchSupplierInvoice({ ...input, fileHash: `harness-b-${stamp}`, excludeInvoiceId: b })
    out.push({ id: 'I1 dublet via leverandør+nr', ok: mB.duplicateOfId === a, note: `duplicateOf=${mB.duplicateOfId === a ? 'A (korrekt)' : mB.duplicateOfId ?? 'ingen'} · leverandør=${mB.supplierId === supplierId ? 'genkendt' : 'ikke genkendt'}` })
    const mA = await matchSupplierInvoice({ ...input, invoiceNumber: null, fileHash: `harness-a-${stamp}`, excludeInvoiceId: a })
    out.push({ id: 'I2 ikke dublet af sig selv', ok: mA.duplicateOfId == null, note: `duplicateOf=${mA.duplicateOfId ?? 'ingen'}` })

    const locked = await ins('incoming_invoices', { ...base, invoice_number: `${invNo}-L`, file_hash: `harness-l-${stamp}`, status: 'approved', approved_by: c.ownerUid, approved_at: new Date().toISOString() })
    const rp = await parseAndMatch(locked)
    const st = ((await c.admin.from('incoming_invoices').select('status').eq('id', locked).single()).data as { status: string }).status
    out.push({ id: 'I3 reparse af godkendt afvises', ok: /låst/.test(rp.message) && st === 'approved', note: `${rp.message} · status=${st}` })

    const { count: econ } = await c.admin.from('accounting_integration_settings').select('id', { count: 'exact', head: true }).eq('active', true)
    if ((econ ?? 0) > 0) {
      out.push({ id: 'I4 parallel godkendelse', ok: false, note: 'SPRUNGET OVER: staging har aktiv regnskabsintegration (vil ikke risikere e-conomic-push)' })
    } else {
      const race = await ins('incoming_invoices', { ...base, invoice_number: `${invNo}-R`, file_hash: `harness-r-${stamp}`, requires_manual_review: false })
      const res = await Promise.all(Array.from({ length: 3 }, () => approveInvoice(race, c.ownerUid)))
      const conflicts = res.filter((r) => /ændret af en anden/.test(r.message)).length
      const { count: approvedAudits } = await c.admin.from('incoming_invoice_audit_log').select('id', { count: 'exact', head: true }).eq('incoming_invoice_id', race).eq('action', 'approved')
      out.push({ id: 'I4 parallel godkendelse', ok: conflicts === 2 && approvedAudits === 1,
        note: `konflikter=${conflicts}/2 · godkendt-audit=${approvedAudits} · vinder: ${res.find((r) => !/ændret af en anden/.test(r.message))?.message ?? '-'}` })
    }
  } finally {
    for (const x of created) {
      if (x.table === 'incoming_invoices') await c.admin.from('incoming_invoice_audit_log').delete().eq('incoming_invoice_id', x.id)
      await c.admin.from(x.table).delete().eq('id', x.id)
    }
  }
  return out
}

export function formatInvoicePipeline(c: InvCheck[]): string {
  const bad = c.filter((x) => !x.ok).length
  return ['', 'LEVERANDØRFAKTURA-PIPELINE (P3 #19):', ...c.map((x) => `  ${x.ok ? '✓' : '❌'} ${x.id.padEnd(34)} ${x.note}`),
    bad ? `  ❌ ${bad} afvigelse(r)` : `  ✅ alle ${c.length} pipeline-checks som forventet`].join('\n')
}
