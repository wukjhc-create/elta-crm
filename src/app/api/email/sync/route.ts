import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const CRON_SECRET = process.env.CRON_SECRET

/**
 * Manual Email Sync — gates with CRON_SECRET Bearer token.
 *
 * Bruges til at trigger Graph mailbox-sync uden at vente på den daglige
 * cron (kl 05:00 UTC). Samme sikkerhed som /api/cron/email-sync —
 * fail-secure hvis CRON_SECRET ikke er konfigureret.
 */
export async function POST(request: Request) {
  // Verify cron secret — fail-secure when not configured
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

  try {
    const { runEmailSync } = await import('@/lib/services/email-sync-orchestrator')
    const result = await runEmailSync()
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      },
      { status: 500 }
    )
  }
}
