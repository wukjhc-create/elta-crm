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

    // R6/R7 end-to-end via parseAndMatch (som mail-/uploadstien): nr. fra fakturateksten
    const { parseAndMatch } = await import('../../src/lib/services/incoming-invoices')
    const invNo2 = `HARNESS-L10B-${stamp}`
    const mkRaw = async (n: number, status: string, number: string | null) => {
      const r = await c.admin.from('incoming_invoices').insert([{ source: 'upload', status, parse_status: 'pending', supplier_id: supplierId, invoice_number: number,
        file_name: `l10b-${n}-${stamp}.txt`, mime_type: 'text/plain', file_hash: `l10b-${n}-${stamp}`,
        raw_text: `Faktura
Fakturanummer: ${invNo2}
Fakturadato: 01-10-2026
Beløb i alt inkl. moms: 1.250,00 DKK`, supplier_name_extracted: `[HARNESS] L10B ${stamp}` }]).select('id')
      const id = (r.data?.[0] as { id?: string } | undefined)?.id ?? null
      if (id) invoiceIds.push(id)
      return id
    }
    await mkRaw(10, 'rejected', invNo2)
    const fresh = await mkRaw(11, 'awaiting_approval', null)
    if (fresh) await parseAndMatch(fresh)
    const f = (await c.admin.from('incoming_invoices').select('status, requires_manual_review, duplicate_of_id').eq('id', fresh ?? '').maybeSingle()).data as { status: string; requires_manual_review: boolean; duplicate_of_id: string | null } | null
    out.push({ id: 'R6 samme nr. som afvist → manuel kontrol (ikke annulleret)', ok: !!f && f.status !== 'cancelled' && f.requires_manual_review === true && !f.duplicate_of_id, note: JSON.stringify(f) })
    const dup = await mkRaw(12, 'awaiting_approval', null)
    if (dup) await parseAndMatch(dup)
    const d = (await c.admin.from('incoming_invoices').select('status, duplicate_of_id').eq('id', dup ?? '').maybeSingle()).data as { status: string; duplicate_of_id: string | null } | null
    out.push({ id: 'R7 samme nr. som en AKTIV → stadig annulleret som dublet', ok: !!d && d.status === 'cancelled' && d.duplicate_of_id === fresh, note: JSON.stringify(d) })
    const invNo3 = `HARNESS-L10C-${stamp}`
    const canc = await c.admin.from('incoming_invoices').insert([{ source: 'upload', status: 'cancelled', parse_status: 'parsed', supplier_id: supplierId, invoice_number: invNo3,
      file_name: `l10c-1-${stamp}.txt`, mime_type: 'text/plain', file_hash: `l10c-1-${stamp}`, raw_text: 'x', supplier_name_extracted: `[HARNESS] L10C ${stamp}` }]).select('id')
    const cancId = (canc.data?.[0] as { id?: string } | undefined)?.id ?? null
    if (cancId) invoiceIds.push(cancId)
    const after = await c.admin.from('incoming_invoices').insert([{ source: 'upload', status: 'awaiting_approval', parse_status: 'pending', supplier_id: supplierId, invoice_number: null,
      file_name: `l10c-2-${stamp}.txt`, mime_type: 'text/plain', file_hash: `l10c-2-${stamp}`, raw_text: `Faktura
Fakturanummer: ${invNo3}
Beløb i alt inkl. moms: 500,00 DKK`, supplier_name_extracted: `[HARNESS] L10C ${stamp}` }]).select('id')
    const afterId = (after.data?.[0] as { id?: string } | undefined)?.id ?? null
    if (afterId) { invoiceIds.push(afterId); await parseAndMatch(afterId) }
    const g = (await c.admin.from('incoming_invoices').select('status, requires_manual_review').eq('id', afterId ?? '').maybeSingle()).data as { status: string; requires_manual_review: boolean } | null
    out.push({ id: 'R8 samme nr. som en ANNULLERET → manuel kontrol', ok: !!g && g.status !== 'cancelled' && g.requires_manual_review === true, note: JSON.stringify(g) })
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
