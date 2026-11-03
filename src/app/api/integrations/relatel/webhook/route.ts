/**
 * Relatel-webhook. Slået fra medmindre RELATEL_ENABLED=true. Registrerer ikke noget hos Relatel.
 * Skriver kun i telephony_calls/telephony_events, og kun med TELEPHONY_PERSIST_ENABLED=true (standard fra) — se
 * lib/integrations/telephony/webhook-gate.ts.
 */
import { NextResponse } from 'next/server'
import { handleRelatelWebhook } from '@/lib/integrations/telephony/webhook-gate'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/utils/logger'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const raw = await request.text()
  const decision = await handleRelatelWebhook(process.env, request.headers.get('x-elta-webhook-secret'), raw, {
    admin: createAdminClient,
    log: (msg, meta) => logger.warn(msg, { metadata: meta }),
  })
  return NextResponse.json(decision.body, { status: decision.status })
}

export function GET() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 })
}
