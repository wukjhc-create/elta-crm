/**
 * IC11 backfill: eksisterende broedtekst-fakturaer, hvis mail HAR vedhaeftninger, opgraderes med PDF'ens tekst.
 * Bevidst IKKE 'use server' (kaldes kun server-side fra faktura-cron'en).
 *
 * - Koerer KUN naar INVOICE_ATTACHMENT_FETCH_ENABLED er TIL (samme flag som den loebende hentning).
 * - Idempotent: hver mail behandles via ingestFromEmail (hash-dedup + opgradering af SAMME raekke, aldrig ny
 *   dubletfaktura; storage-upload er upsert paa fast sti). Et 'attachment_backfill'-audit-spor markerer mailen som
 *   faerdig; kun forbigaaende hentefejl proeves igen (max MAX_ATTEMPTS).
 * - Fejl paa én mail stopper ikke batchen. Resultat logges pr. mail (audit-log paa fakturaen + returneret liste).
 * - Ingen mail sendes, ingen e-conomic/finance-skrivning (fakturaer ender altid i awaiting_approval).
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/utils/logger'
import { isInvoiceAttachmentFetchEnabled } from '@/lib/invoice-control/attachment-gate'
import { selectInChunks, IN_CHUNK_SIZE } from '@/lib/supabase/in-chunks'
import { fetchAllRows } from '@/lib/supabase/fetch-all'

export const BACKFILL_AUDIT_ACTION = 'attachment_backfill'
const MAX_ATTEMPTS = 3
const LOCKED = ['approved', 'posted', 'rejected', 'cancelled']

export type BackfillOutcome = 'upgraded' | 'ingested' | 'duplicate' | 'customer_mail' | 'no_invoice_pdf' | 'fetch_failed' | 'error'

export interface BackfillMailResult { emailId: string; invoiceId: string; outcome: BackfillOutcome; detail: string }
export interface BackfillSummary { enabled: boolean; candidates: number; processed: number; results: BackfillMailResult[]; byOutcome: Record<string, number> }

interface Candidate { invoiceId: string; emailId: string }

/** Ren klassifikation af ingestFromEmail-resultatet (testbar). */
export function classifyBackfill(r: { ingested: number; upgraded?: number; duplicates: number; errors: string[]; skipped?: string[] }): { outcome: BackfillOutcome; ok: boolean } {
  if ((r.upgraded ?? 0) > 0) return { outcome: 'upgraded', ok: true }
  if (r.skipped?.includes('customer_mail')) return { outcome: 'customer_mail', ok: true }
  if (r.errors.some((e) => /attachment fetch failed/.test(e))) return { outcome: 'fetch_failed', ok: false }
  if (r.ingested > 0) return { outcome: 'ingested', ok: true }
  if (r.duplicates > 0) return { outcome: 'duplicate', ok: true }
  if (r.errors.length > 0) return { outcome: 'error', ok: false }
  return { outcome: 'no_invoice_pdf', ok: true }
}

/** Broedtekst-fakturaer (ulaaste) hvis mail har vedhaeftninger og som ikke er faerdigbehandlet af backfill. */
export async function findBackfillCandidates(limit: number, onlyEmailIds?: string[]): Promise<{ total: number; batch: Candidate[] }> {
  const supabase = createAdminClient()
  const { data: invs } = await supabase
    .from('incoming_invoices')
    .select('id, source_email_id, status, file_name, created_at')
    .eq('source', 'email')
    .like('file_name', 'email-%.txt')
    .not('source_email_id', 'is', null)
    .order('created_at', { ascending: true })
  const open = (invs ?? []).filter((i) => (!onlyEmailIds || onlyEmailIds.includes(i.source_email_id as string)) && !LOCKED.includes(i.status as string) && i.file_name === `email-${i.source_email_id}.txt`)
  if (open.length === 0) return { total: 0, batch: [] }

  const emailIds = [...new Set(open.map((i) => i.source_email_id as string))]
  // X4n: i bidder af 200 (alle kandidater i én .in() sprængte URL-grænsen ~350 → ingen kandidater fundet)
  const mails = await selectInChunks<{ id: string; has_attachments: boolean | null; graph_message_id: string | null }>(emailIds, (chunk) =>
    supabase.from('incoming_emails').select('id, has_attachments, graph_message_id').in('id', chunk))
  const withAtt = new Set(mails.filter((m) => m.has_attachments && m.graph_message_id).map((m) => m.id))

  const openIds = open.map((i) => i.id as string)
  const audits: Array<{ id: string; incoming_invoice_id: string; ok: boolean | null }> = []
  for (let k = 0; k < openIds.length; k += IN_CHUNK_SIZE) {
    const chunk = openIds.slice(k, k + IN_CHUNK_SIZE)
    audits.push(...await fetchAllRows<{ id: string; incoming_invoice_id: string; ok: boolean | null }>((from, to) => supabase
      .from('incoming_invoice_audit_log').select('id, incoming_invoice_id, ok')
      .eq('action', BACKFILL_AUDIT_ACTION).in('incoming_invoice_id', chunk).order('id').range(from, to)))
  }
  const done = new Set<string>()
  const failures = new Map<string, number>()
  for (const a of audits) {
    const id = a.incoming_invoice_id as string
    if (a.ok) done.add(id)
    else failures.set(id, (failures.get(id) ?? 0) + 1)
  }
  const all = open
    .filter((i) => withAtt.has(i.source_email_id as string) && !done.has(i.id as string) && (failures.get(i.id as string) ?? 0) < MAX_ATTEMPTS)
    .map((i) => ({ invoiceId: i.id as string, emailId: i.source_email_id as string }))
  return { total: all.length, batch: all.slice(0, Math.max(0, limit)) }
}

/** onlyEmailIds: afgraens til bestemte mails (tests / maalrettet koersel). */
export async function backfillInvoiceAttachments(opts: { limit?: number; dryRun?: boolean; onlyEmailIds?: string[] } = {}): Promise<BackfillSummary> {
  const limit = opts.limit ?? 8
  const summary: BackfillSummary = { enabled: isInvoiceAttachmentFetchEnabled(), candidates: 0, processed: 0, results: [], byOutcome: {} }
  if (!summary.enabled) return summary
  const { total, batch } = await findBackfillCandidates(limit, opts.onlyEmailIds)
  summary.candidates = total
  if (opts.dryRun) return summary

  const supabase = createAdminClient()
  const { ingestFromEmail } = await import('@/lib/services/incoming-invoices')
  for (const c of batch) {
    let res: BackfillMailResult
    let ok = true
    try {
      const r = await ingestFromEmail(c.emailId)
      const cls = classifyBackfill(r)
      ok = cls.ok
      res = { ...c, outcome: cls.outcome, detail: `ingested=${r.ingested} upgraded=${r.upgraded ?? 0} dup=${r.duplicates} skipped=${(r.skipped ?? []).join(',') || '-'} err=${r.errors.length}` }
    } catch (err) {
      ok = false
      res = { ...c, outcome: 'error', detail: err instanceof Error ? err.message.slice(0, 200) : String(err) }
    }
    summary.results.push(res)
    summary.processed++
    summary.byOutcome[res.outcome] = (summary.byOutcome[res.outcome] ?? 0) + 1
    try {
      await supabase.from('incoming_invoice_audit_log').insert({
        incoming_invoice_id: c.invoiceId, action: BACKFILL_AUDIT_ACTION, ok, message: `${res.outcome}: ${res.detail}`,
        new_value: { email_id: c.emailId, outcome: res.outcome },
      })
    } catch (err) {
      logger.warn('attachment backfill: audit insert failed', { entityId: c.invoiceId, error: err })
    }
    logger.info('attachment backfill: mail processed', { entityId: c.emailId, metadata: { invoiceId: c.invoiceId, outcome: res.outcome, detail: res.detail } })
  }
  return summary
}
