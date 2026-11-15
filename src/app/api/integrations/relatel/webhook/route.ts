/**
 * Relatel-webhook. Slået fra medmindre RELATEL_ENABLED=true. Registrerer ikke noget hos Relatel.
 * Godkendelse: Relatel-Signature (HMAC-SHA256, RELATEL_WEBHOOK_SIGNING_KEY) — se lib/integrations/telephony/signature.ts.
 * Skriver kun i telephony_calls/telephony_events, og kun med TELEPHONY_PERSIST_ENABLED=true (standard fra) — se
 * lib/integrations/telephony/webhook-gate.ts.
 */
import { NextResponse } from 'next/server'
import { handleRelatelWebhook } from '@/lib/integrations/telephony/webhook-gate'
import { createDiagnosticLimiter, relatelRejectionDiagnostic } from '@/lib/integrations/telephony/webhook-diagnostics'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/utils/logger'
import { logHealth } from '@/lib/services/system-health'

export const dynamic = 'force-dynamic'

// MIDLERTIDIG (2026-11-15): diagnose af afviste Relatel-leveringer — kun metadata, kun med Relatels egne headere, rate-begrænset
const diagnosticAllowed = createDiagnosticLimiter(20, 10 * 60_000)

export async function POST(request: Request) {
  const raw = await request.text()
  const signature = request.headers.get('relatel-signature')
  const timestamp = request.headers.get('relatel-timestamp')
  const deliveryId = request.headers.get('relatel-delivery-id')
  const decision = await handleRelatelWebhook(process.env, {
    signature,
    timestamp,
    deliveryId,
    staticSecret: request.headers.get('x-elta-webhook-secret'),
  }, raw, {
    admin: createAdminClient,
    log: (msg, meta) => logger.warn(msg, { metadata: meta }),
    // Observationstilstand (TELEPHONY_PERSIST_ENABLED fra): kun godkendte Relatel-leveringer, kun skema-metadata
    observe: (o) => logHealth('telephony', 'ok', `relatel webhook observeret: ${o.eventType} → ${o.outcome}`, {
      event_type: o.eventType, http_status: o.status, outcome: o.outcome, key_slot: o.keySlot, payload_shape: o.shape,
    }),
    onReject: async (r) => {
      // Kun leveringer der bærer Relatels egne headere (ikke tilfældige anonyme kald), og højst 20 pr. 10 min pr. instans
      if (!(signature || deliveryId || request.headers.get('relatel-event-type'))) return
      if (!diagnosticAllowed()) return
      await logHealth('telephony', 'warning', `relatel webhook afvist (diagnose): ${r.stage}`, relatelRejectionDiagnostic({
        headerNames: [...request.headers.keys()],
        contentType: request.headers.get('content-type'),
        signature, timestamp, deliveryId,
        rawBody: raw,
        nowSeconds: Math.floor(Date.now() / 1000),
        status: r.status, stage: r.stage, authMode: r.authMode,
        env: process.env,
      }))
    },
  })
  return NextResponse.json(decision.body, { status: decision.status })
}

export function GET() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 })
}
