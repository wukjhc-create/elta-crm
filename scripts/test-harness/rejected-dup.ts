/**
 * 00221 (L-10) på staging: fakturanummer kun unikt blandt aktive leverandørfakturaer.
 * Probe-leverandør + -fakturaer ryddes i finally.
 *
 *   R1  struktur: indekset er unikt og udelader rejected/cancelled
 *   R2  ny faktura med samme leverandør + nr. som en AFVIST kan gemmes (før: unik-fejl / annulleret som dublet)
 *   R3  matcher: hit på afvist → ingen dublet, sameNumberAsRejectedId = den afviste
 *   R4  to AKTIVE med samme nr. afvises stadig af indekset (23505)
 *   R5  matcher: hit på aktiv → stadig dublet
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface DupCheck { id: string; ok: boolean; note: string }

export async function runRejectedDup(c: { admin: SupabaseClient; sql: (q: string) => Promise<any[]> }): Promise<DupCheck[]> {
  const out: DupCheck[] = []
  const { matchSupplierInvoice } = await import('../../src/lib/services/incoming-invoice-matcher')
  const stamp = Date.now()
  const invNo = `HARNESS-L10-${stamp}`
  const invoiceIds: string[] = []
  let supplierId: string | null = null
  const mkInvoice = async (status: string, n: number) => {
    const r = await c.admin.from('incoming_invoices').insert([{ source: 'upload', status, parse_status: 'parsed', supplier_id: supplierId,
      invoice_number: invNo, file_name: `l10-${n}-${stamp}.txt`, mime_type: 'text/plain', raw_text: 'HARNESS L-10', file_hash: `l10-${n}-${stamp}`,
      supplier_name_extracted: `[HARNESS] L10 ${stamp}` }]).select('id')
    const id = (r.data?.[0] as { id?: string } | undefined)?.id ?? null
    if (id) invoiceIds.push(id)
    return { id, error: r.error as { code?: string; message?: string } | null }
  }
  const base = { supplierName: null, supplierVatNumber: null, invoiceNumber: invNo, workOrderHints: [], supplierOrderRefs: [], deliveryAddressHints: [], fileHash: null }
  try {
    const idx = await c.sql(`SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND indexname='uq_incoming_invoices_supplier_number'`)
    const def = String(idx[0]?.indexdef ?? '')
    out.push({ id: 'R1 struktur', ok: /UNIQUE/i.test(def) && /rejected/.test(def) && /cancelled/.test(def), note: def.replace(/\s+/g, ' ').slice(0, 200) || 'indeks mangler' })

    const sup = await c.admin.from('suppliers').insert([{ name: `HARNESS-L10 ${stamp}`, code: `HL10${stamp}` }]).select('id')
    supplierId = (sup.data?.[0] as { id?: string } | undefined)?.id ?? null
    if (!supplierId) throw new Error(`seed supplier: ${sup.error?.message}`)

    const rejected = await mkInvoice('rejected', 1)
    const resent = await mkInvoice('awaiting_approval', 2)
    out.push({ id: 'R2 gensendt efter afvisning kan gemmes', ok: !!rejected.id && !!resent.id, note: resent.error ? `fejl ${resent.error.code} ${resent.error.message?.slice(0, 80)}` : 'gemt' })

    const m1 = await matchSupplierInvoice({ ...base, knownSupplierId: supplierId, excludeInvoiceId: resent.id })
    out.push({ id: 'R3 hit på afvist = ikke dublet, manuel kontrol', ok: m1.duplicateOfId === null && m1.sameNumberAsRejectedId === rejected.id,
      note: `dublet=${m1.duplicateOfId ?? '-'} · samme-nr-som-afvist=${m1.sameNumberAsRejectedId === rejected.id ? 'ja' : m1.sameNumberAsRejectedId ?? '-'}` })

    const third = await mkInvoice('awaiting_approval', 3)
    out.push({ id: 'R4 to aktive med samme nr. afvises', ok: !third.id && third.error?.code === '23505', note: third.id ? 'ACCEPTERET' : `afvist (${third.error?.code})` })

    const m2 = await matchSupplierInvoice({ ...base, knownSupplierId: supplierId, excludeInvoiceId: '00000000-0000-0000-0000-000000000000' })
    out.push({ id: 'R5 hit på aktiv = dublet', ok: !!resent.id && m2.duplicateOfId === resent.id, note: `dublet=${m2.duplicateOfId === resent.id ? 'den aktive' : m2.duplicateOfId ?? '-'}` })
  } finally {
    for (const id of invoiceIds) {
      await c.admin.from('incoming_invoice_audit_log').delete().eq('incoming_invoice_id', id)
      await c.admin.from('incoming_invoices').delete().eq('id', id)
    }
    if (supplierId) await c.admin.from('suppliers').delete().eq('id', supplierId)
  }
  return out
}

export function formatRejectedDup(checks: DupCheck[]): string {
  const lines = checks.map((c) => `${c.ok ? 'PASS' : 'FAIL'}  ${c.id} — ${c.note}`)
  const bad = checks.filter((c) => !c.ok).length
  return [...lines, bad ? `❌ ${bad} fejl` : `✅ 00221 ${checks.length}/${checks.length}`].join('\n')
}
