/**
 * Relatel-webhook. Slået fra medmindre RELATEL_ENABLED=true.
 * Registrerer ikke noget hos Relatel og skriver ikke i databasen.
 */
import { NextResponse } from 'next/server'
import { decideRelatelWebhook } from '@/lib/integrations/telephony/webhook-gate'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const raw = await request.text()
  const decision = decideRelatelWebhook(process.env, request.headers.get('x-elta-webhook-secret'), raw)
  return NextResponse.json(decision.body, { status: decision.status })
}

export function GET() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 })
}
