/**
 * Cron Job: Pull supplier invoices from API/EDI feeds (Phase 15.3).
 *
 * Runs ingestFromSupplierAPI for each configured provider (AO, LM).
 * Adapter failures and skips never crash the cron — each provider is
 * isolated and the result is returned for inspection.
 *
 * Schedule: every 6 hours (vercel.json).
 * Auth: Bearer CRON_SECRET.
 */

import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { logger } from '@/lib/utils/logger'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const CRON_SECRET = process.env.CRON_SECRET

const PROVIDERS: Array<'AO' | 'LM'> = ['AO', 'LM']

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

    const { ingestFromSupplierAPI } = await import('@/lib/services/incoming-invoices')

    const results = []
    for (const provider of PROVIDERS) {
      try {
        const r = await ingestFromSupplierAPI(provider, { sinceDays: 30 })
        results.push(r)
      } catch (err) {
        logger.error('incoming-invoices-api cron: provider threw', {
          metadata: { provider }, error: err,
        })
        results.push({
          provider,
          fetched: 0, inserted: 0, duplicates: 0, errors: [String(err)],
          invoiceIds: [], skipped: true,
          skipReason: err instanceof Error ? err.message : String(err),
        })
      }
    }

    const summary = {
      providers: results.length,
      total_inserted: results.reduce((s, r) => s + r.inserted, 0),
      total_duplicates: results.reduce((s, r) => s + r.duplicates, 0),
      total_errors: results.reduce((s, r) => s + r.errors.length, 0),
      skipped: results.filter((r) => r.skipped).map((r) => `${r.provider}:${r.skipReason ?? 'skipped'}`),
    }
    console.log('INCOMING INVOICES API CRON:', JSON.stringify(summary))
    return NextResponse.json({ ok: true, summary, results })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    )
  }
}
