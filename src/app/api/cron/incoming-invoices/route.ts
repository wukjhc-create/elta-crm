/**
 * Cron Job: Incoming supplier invoice ingest (Phase 15).
 *
 * Scans recent incoming_emails (last 24h) for likely supplier invoices
 * (PDF attachments OR sender domain matches a known supplier) and runs
 * ingestFromEmail per email. The ingest function itself is idempotent
 * via file_hash UNIQUE.
 *
 * Schedule: every hour. Auth: Bearer CRON_SECRET.
 */

import { NextResponse } from 'next/server'
import { safeEqual } from '@/lib/security/safe-equal'
import { logger } from '@/lib/utils/logger'
import { withCronRun } from '@/lib/services/cron-run'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const CRON_SECRET = process.env.CRON_SECRET

async function handleCron(request: Request): Promise<Response> {
  try {
    const authHeader = request.headers.get('authorization') || ''
    const expected = `Bearer ${CRON_SECRET}`
    if (
      !CRON_SECRET ||
      authHeader.length !== expected.length ||
      !safeEqual(authHeader, expected)
    ) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { createAdminClient } = await import('@/lib/supabase/admin')
    const { ingestFromEmail } = await import('@/lib/services/incoming-invoices')
    const supabase = createAdminClient()

    // Cron-review 2026-10-09 (#5): 72 t i stedet for 24 t — mail synkes kun 05:00 (eller når nogen har mailsiden
    // åben), så fakturaer modtaget efter synk faldt uden for næste vindue. Ingest er idempotent (duplicates).
    const since = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString()
    const { data: emails } = await supabase
      .from('incoming_emails')
      .select('id, sender_email, subject, has_attachments')
      .gte('received_at', since)
      .or('has_attachments.eq.true,subject.ilike.%faktura%,subject.ilike.%invoice%')
      .order('received_at', { ascending: false })
      .limit(200)

    const summary = { scanned: 0, ingested: 0, duplicates: 0, errors: 0, deferred: 0 }
    // PF2-2: tidsbudget (maxDuration 60 s) — resten tages ved næste kørsel (vinduet er 72 t)
    const startedAt = Date.now()
    for (const e of emails ?? []) {
      if (Date.now() - startedAt > 45_000) { summary.deferred++; continue }
      // IV-8: før et (dødt) afsender-filter på delstrenge ('ao' ramte @aol.com); leverandørdomænet afgøres nu i
      // ingestFromEmail, når der kun er brødtekst
      const subjectHit = /faktura|invoice|kreditnota|credit\s*note/i.test(e.subject || '')
      if (!e.has_attachments && !subjectHit) continue

      summary.scanned++
      try {
        const r = await ingestFromEmail(e.id)
        summary.ingested += r.ingested
        summary.duplicates += r.duplicates
        summary.errors += r.errors.length
      } catch (err) {
        summary.errors++
        logger.error('incoming-invoices cron: ingestFromEmail threw', { entityId: e.id, error: err })
      }
    }

    console.log(
      'INCOMING INVOICES CRON:',
      `scanned=${summary.scanned}`,
      `ingested=${summary.ingested}`,
      `dup=${summary.duplicates}`,
      `err=${summary.errors}`
    )

    // IC11: backfill af aeldre broedtekst-fakturaer med PDF-vedhaeftning — kun naar INVOICE_ATTACHMENT_FETCH_ENABLED
    // er TIL (ellers no-op). Lille batch pr. koersel (maxDuration 60 s); idempotent, fejl pr. mail isoleres.
    let backfill: { candidates: number; processed: number; byOutcome: Record<string, number> } | null = null
    try {
      const { backfillInvoiceAttachments } = await import('@/lib/invoice-control/attachment-backfill')
      const b = await backfillInvoiceAttachments({ limit: 8 })
      if (b.enabled) {
        backfill = { candidates: b.candidates, processed: b.processed, byOutcome: b.byOutcome }
        console.log('INCOMING INVOICES BACKFILL:', `candidates=${b.candidates}`, `processed=${b.processed}`, JSON.stringify(b.byOutcome))
      }
    } catch (err) {
      logger.error('incoming-invoices cron: attachment backfill threw', { error: err })
    }
    return NextResponse.json({ ok: true, summary, backfill })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    )
  }
}

// P1 #9: hver autoriseret koersel registreres i system_health_log (service='cron').
export const GET = withCronRun('incoming-invoices', handleCron)
