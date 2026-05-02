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
import { timingSafeEqual } from 'crypto'
import { logger } from '@/lib/utils/logger'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const CRON_SECRET = process.env.CRON_SECRET

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization') || ''
    const expected = `Bearer ${CRON_SECRET}`
    if (
      !CRON_SECRET ||
      authHeader.length !== expected.length ||
      !timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected))
    ) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { createAdminClient } = await import('@/lib/supabase/admin')
    const { ingestFromEmail } = await import('@/lib/services/incoming-invoices')
    const supabase = createAdminClient()

    // Pull supplier email-domains so sender-based filtering works.
    const { data: suppliers } = await supabase
      .from('suppliers')
      .select('code, name')
    const supplierTokens = new Set<string>()
    for (const s of suppliers ?? []) {
      if (s.code) supplierTokens.add(String(s.code).toLowerCase())
      if (s.name) supplierTokens.add(String(s.name).toLowerCase().split(/\s+/)[0])
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: emails } = await supabase
      .from('incoming_emails')
      .select('id, sender_email, subject, has_attachments')
      .gte('received_at', since)
      .or('has_attachments.eq.true,subject.ilike.%faktura%,subject.ilike.%invoice%')
      .limit(200)

    const summary = { scanned: 0, ingested: 0, duplicates: 0, errors: 0 }
    for (const e of emails ?? []) {
      const sender = (e.sender_email || '').toLowerCase()
      const senderDomain = sender.split('@')[1] || ''
      const subjectHit = /faktura|invoice|kreditnota|credit\s*note/i.test(e.subject || '')
      const senderHit = Array.from(supplierTokens).some((tok) => tok && (sender.includes(tok) || senderDomain.includes(tok)))
      if (!e.has_attachments && !subjectHit && !senderHit) continue

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
    return NextResponse.json({ ok: true, summary })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    )
  }
}
