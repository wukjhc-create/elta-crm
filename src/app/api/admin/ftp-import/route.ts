/**
 * Manual FTP Import Trigger
 *
 * POST /api/admin/ftp-import
 * Body: { "supplierCode": "AO" | "LM", "dryRun": false }
 * Auth: Bearer CRON_SECRET
 */

import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { importFromFtp } from '@/lib/integrations/ftp-service'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes max

const CRON_SECRET = process.env.CRON_SECRET

export async function POST(request: Request) {
  try {
    // Authenticate
    const authHeader = request.headers.get('authorization')
    const expected = `Bearer ${CRON_SECRET}`
    if (
      !CRON_SECRET ||
      !authHeader ||
      authHeader.length !== expected.length ||
      !timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected))
    ) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse body
    const body = await request.json().catch(() => ({}))
    const supplierCode = body.supplierCode?.toUpperCase()

    if (supplierCode !== 'AO' && supplierCode !== 'LM') {
      return NextResponse.json(
        { error: 'Invalid supplierCode. Must be "AO" or "LM".' },
        { status: 400 }
      )
    }

    const dryRun = body.dryRun === true

    const result = await importFromFtp(supplierCode, { dryRun })

    return NextResponse.json({
      ...result,
      timestamp: new Date().toISOString(),
      mode: dryRun ? 'dry_run' : 'live',
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
