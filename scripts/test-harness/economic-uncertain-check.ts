/**
 * A-4 på staging (Henrik 2026-10-21): eksport med uvist udfald låser fakturaen til manuel frigivelse.
 *   E1  frisk krav + UNCERTAIN-log → createInvoiceInEconomic afviser ('export uncertain'), kravet bliver
 *   E2  GAMMELT krav (> 15 min, ville ellers blive overtaget) + UNCERTAIN-log → afvises stadig, kravet bliver
 *   E3  UNCERTAIN-log for et ANDET krav låser ikke dette krav (matcher præcist request_meta.claim)
 *   E4  krav uden UNCERTAIN-log → ingen lås (normal sti; her stoppet af opsætning/kill-switch — intet postes)
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

    const d = await mk('andet-krav', 60, 'pending-1')
    const lockD = await uncertainExportLock(c.admin, d.id)
    out.push({ id: 'E3 log for et andet krav låser ikke', ok: lockD === null, note: `lås=${lockD ? 'ja' : 'nej'}` })

    const e = await mk('uden-log', 60, 'none')
    const lockE = await uncertainExportLock(c.admin, e.id)
    const re = await createInvoiceInEconomic(e.id)
    out.push({ id: 'E4 krav uden UNCERTAIN-log er ikke låst', ok: lockE === null && re.reason !== 'export uncertain', note: `lås=${lockE ? 'ja' : 'nej'} reason=${re.reason}` })

    const lockA = await uncertainExportLock(c.admin, a.id)
    out.push({ id: 'E5 låsen angiver forsøgets tidspunkt og krav', ok: !!lockA && lockA.claim === a.claim && !!lockA.since, note: lockA ? `since=${lockA.since}` : 'ingen' })
  } finally {
    if (ids.length) {
      await c.admin.from('accounting_sync_log').delete().eq('entity_type', 'invoice').in('entity_id', ids)
      await c.admin.from('invoices').delete().in('id', ids)
    }
  }
  return out
}

export function formatEconomicUncertainCheck(checks: EuCheck[]): string {
  return ['A-4 e-conomic uvist udfald — staging', ...checks.map((k) => `  ${k.ok ? 'PASS' : 'FAIL'}  ${k.id} — ${k.note}`)].join('\n')
}
