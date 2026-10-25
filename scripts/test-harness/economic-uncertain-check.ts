/**
 * A-4 på staging (Henrik 2026-10-21): eksport med uvist udfald låser fakturaen til manuel frigivelse.
 *   E1  frisk krav + UNCERTAIN-log → createInvoiceInEconomic afviser ('export uncertain'), kravet bliver
 *   E2  GAMMELT krav (> 15 min, ville ellers blive overtaget) + UNCERTAIN-log → afvises stadig, kravet bliver
 *   E3  UNCERTAIN-log for et ANDET krav låser ikke dette krav (matcher præcist request_meta.claim)
 *   E4  EC-T1: FORÆLDET krav (> 15 min) uden afgørende log → låst ('stale_no_log'), ingen eksport/overtagelse
 *   E6  EC-T1: FRISK krav uden log → ikke låst ("i gang"), intet postes
 *   E7  EC-T1: forældet krav MED succes-log → ikke låst (EC-5 genskaber linket)
 * Intet sendes til e-conomic (låsen tjekkes før opsætning; staging har ingen e-conomic-adgang/kill-switch).
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface EuCheck { id: string; ok: boolean; note: string }

export async function runEconomicUncertainCheck(c: { admin: SupabaseClient }): Promise<EuCheck[]> {
  const out: EuCheck[] = []
  const { createInvoiceInEconomic, uncertainExportLock, EXPORT_UNCERTAIN_MARK } = await import('../../src/lib/services/economic-client')
  const stamp = Date.now()
  const ids: string[] = []
  const mk = async (tag: string, claimAgoMin: number, logClaimOverride?: string) => {
    const claim = `pending-${Date.now() - claimAgoMin * 60_000}`
    const { data, error } = await c.admin.from('invoices').insert({ invoice_number: `H-A4-${tag}-${stamp}`, status: 'sent', total_amount: 80, tax_amount: 20, final_amount: 100, external_invoice_id: claim }).select('id').single()
    if (error || !data) throw new Error(`faktura ${tag}: ${error?.message}`)
    const id = (data as { id: string }).id
    ids.push(id)
    if (logClaimOverride !== 'none') {
      const { error: lErr } = await c.admin.from('accounting_sync_log').insert({ provider: 'economic', entity_type: 'invoice', entity_id: id, action: 'create', status: 'failed',
        error_message: `${EXPORT_UNCERTAIN_MARK} fetch failed`, request_meta: { http_status: 0, uncertain: true, claim: logClaimOverride ?? claim } })
      if (lErr) throw new Error(`log ${tag}: ${lErr.message}`)
    }
    return { id, claim }
  }
  const claimOf = async (id: string) => ((await c.admin.from('invoices').select('external_invoice_id').eq('id', id).maybeSingle()).data as { external_invoice_id: string | null } | null)?.external_invoice_id ?? null
  try {
    const a = await mk('frisk', 1)
    const ra = await createInvoiceInEconomic(a.id)
    out.push({ id: 'E1 frisk usikkert krav afvises, kravet bliver', ok: ra.reason === 'export uncertain' && (await claimOf(a.id)) === a.claim, note: `reason=${ra.reason} status=${ra.status}` })

    const b = await mk('gammel', 60)
    const rb = await createInvoiceInEconomic(b.id)
    out.push({ id: 'E2 gammelt usikkert krav tages ikke over', ok: rb.reason === 'export uncertain' && (await claimOf(b.id)) === b.claim, note: `reason=${rb.reason}` })

    const d = await mk('andet-krav', 1, 'pending-1')
    const lockD = await uncertainExportLock(c.admin, d.id)
    out.push({ id: 'E3 log for et andet krav låser ikke (frisk krav)', ok: lockD === null, note: `lås=${lockD ? 'ja' : 'nej'}` })

    const e = await mk('uden-log', 60, 'none')
    const lockE = await uncertainExportLock(c.admin, e.id)
    const re = await createInvoiceInEconomic(e.id)
    out.push({ id: 'E4 EC-T1: forældet krav uden log = UVIST (låst, ingen overtagelse)', ok: lockE?.reason === 'stale_no_log' && re.reason === 'export uncertain' && (await claimOf(e.id)) === e.claim, note: `lås=${lockE?.reason ?? 'nej'} reason=${re.reason}` })

    const f = await mk('frisk-uden-log', 1, 'none')
    const lockF = await uncertainExportLock(c.admin, f.id)
    const rf = await createInvoiceInEconomic(f.id)
    out.push({ id: 'E6 EC-T1: frisk krav uden log er ikke låst (kravet urørt, intet postes)', ok: lockF === null && rf.reason !== 'export uncertain' && (await claimOf(f.id)) === f.claim, note: `lås=${lockF ? 'ja' : 'nej'} reason=${rf.reason}` })

    const g = await mk('gammel-med-succes', 60, 'none')
    await c.admin.from('accounting_sync_log').insert({ provider: 'economic', entity_type: 'invoice', entity_id: g.id, action: 'create', status: 'success', external_id: 'draft-999001' })
    const lockG = await uncertainExportLock(c.admin, g.id)
    out.push({ id: 'E7 EC-T1: forældet krav med succes-log er ikke uvist', ok: lockG === null, note: `lås=${lockG?.reason ?? 'nej'}` })

    const lockA = await uncertainExportLock(c.admin, a.id)
    out.push({ id: 'E5 låsen angiver forsøgets tidspunkt og krav', ok: !!lockA && lockA.claim === a.claim && !!lockA.since, note: lockA ? `since=${lockA.since}` : 'ingen' })
  } finally {
    if (ids.length) {
      await c.admin.from('accounting_sync_log').delete().eq('entity_type', 'invoice').in('entity_id', ids)
      await c.admin.from('invoices').delete().in('id', ids)
    }
  }
  // A-4b (Henrik 2026-10-22): samme lås for leverandørfakturaer (incoming_invoices)
  const { pushSupplierInvoiceToEconomic } = await import('../../src/lib/services/economic-client')
  const { rejectInvoice } = await import('../../src/lib/services/incoming-invoices')
  const supIds: string[] = []
  const mkSup = async (tag: string, claimAgoMin: number, logClaim?: string) => {
    const claim = `pending-${Date.now() - claimAgoMin * 60_000}`
    const { data, error } = await c.admin.from('incoming_invoices').insert({ source: 'manual', status: 'approved', invoice_number: `H-A4B-${tag}-${stamp}`, currency: 'DKK', external_invoice_id: claim }).select('id').single()
    if (error || !data) throw new Error(`leverandørfaktura ${tag}: ${error?.message}`)
    const id = (data as { id: string }).id
    supIds.push(id)
    if (logClaim !== 'none') {
      const { error: lErr } = await c.admin.from('accounting_sync_log').insert({ provider: 'economic', entity_type: 'invoice', entity_id: id, action: 'create', status: 'failed',
        error_message: `${EXPORT_UNCERTAIN_MARK} fetch failed`, request_meta: { http_status: 0, uncertain: true, claim: logClaim ?? claim, kind: 'supplier_invoice' } })
      if (lErr) throw new Error(`log ${tag}: ${lErr.message}`)
    }
    return { id, claim }
  }
  const supClaimOf = async (id: string) => ((await c.admin.from('incoming_invoices').select('external_invoice_id, status').eq('id', id).maybeSingle()).data ?? null) as { external_invoice_id: string | null; status: string } | null
  try {
    const sa = await mkSup('frisk', 1)
    const rsa = await pushSupplierInvoiceToEconomic(sa.id)
    out.push({ id: 'S1 leverandør: usikkert krav blokerer ny bogføring, kravet bliver', ok: rsa.reason === 'export uncertain' && (await supClaimOf(sa.id))?.external_invoice_id === sa.claim, note: `reason=${rsa.reason}` })
    const sb = await mkSup('gammel', 60)
    const rsb = await pushSupplierInvoiceToEconomic(sb.id)
    out.push({ id: 'S2 leverandør: gammelt usikkert krav tages ikke over (stale ignoreres)', ok: rsb.reason === 'export uncertain' && (await supClaimOf(sb.id))?.external_invoice_id === sb.claim, note: `reason=${rsb.reason}` })
    const sc = await mkSup('andet-krav', 1, 'pending-1')
    const lockC = await uncertainExportLock(c.admin, sc.id, 'incoming_invoices')
    out.push({ id: 'S3 leverandør: log for et andet krav låser ikke', ok: lockC === null, note: `lås=${lockC ? 'ja' : 'nej'}` })
    const sd = await mkSup('uden-log', 60, 'none')
    const rsd = await pushSupplierInvoiceToEconomic(sd.id)
    out.push({ id: 'S4 EC-T1 leverandør: forældet krav uden log = UVIST (låst)', ok: rsd.reason === 'export uncertain' && (await supClaimOf(sd.id))?.external_invoice_id === sd.claim, note: `reason=${rsd.reason}` })
    const sf = await mkSup('frisk-uden-log', 1, 'none')
    const rsf = await pushSupplierInvoiceToEconomic(sf.id)
    out.push({ id: 'S6 EC-T1 leverandør: frisk krav uden log er ikke låst (kravet urørt)', ok: rsf.reason !== 'export uncertain' && (await supClaimOf(sf.id))?.external_invoice_id === sf.claim, note: `reason=${rsf.reason}` })
    const rj = await rejectInvoice(sa.id, '00000000-0000-0000-0000-000000000000', 'harness')
    out.push({ id: 'S5 leverandør: usikker faktura kan ikke afvises (dansk tekst, ingen rå fejl)', ok: !rj.ok && /Uvist om leverandørfakturaen/.test(rj.message) && !/UNCERTAIN|fetch failed/.test(rj.message) && (await supClaimOf(sa.id))?.status === 'approved', note: rj.message })
  } finally {
    if (supIds.length) {
      await c.admin.from('accounting_sync_log').delete().eq('entity_type', 'invoice').in('entity_id', supIds)
      await c.admin.from('incoming_invoice_audit_log').delete().in('incoming_invoice_id', supIds)
      await c.admin.from('incoming_invoices').delete().in('id', supIds)
    }
  }
  return out
}

export function formatEconomicUncertainCheck(checks: EuCheck[]): string {
  return ['A-4/A-4b e-conomic uvist udfald — staging', ...checks.map((k) => `  ${k.ok ? 'PASS' : 'FAIL'}  ${k.id} — ${k.note}`)].join('\n')
}
