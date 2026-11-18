/**
 * ELTA web-chat (fase 3A, STAGING). Slået fra medmindre RECEPTION_WEBCHAT_ENABLED=true OG misbrugsværnet er konfigureret
 * (RECEPTION_WEBCHAT_RATE_SECRET ≥ 32 tegn) (prod: FRA) → 404. Server-side grænser: lib/reception/webchat/abuse.ts.
 * Valgfri test-nøgle RECEPTION_WEBCHAT_TEST_KEY (trin D, ikke-offentlig pilot): sat ⇒ header x-elta-webchat-key kræves.
 * Ingen login (besøgende), ingen cookies; sessionen bæres af et tilfældigt token (kun SHA-256 gemmes). Sender intet
 * (ingen SMS/mail/opkald) — svaret returneres kun til chat-vinduet. Se lib/reception/webchat/service.ts.
 */
import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { webChatEnabled } from '@/lib/reception/flags'
import { postWebChatMessage, startWebChat, type WebChatError } from '@/lib/reception/webchat/service'
import { abuseKey, clientIp } from '@/lib/reception/webchat/abuse'

export const dynamic = 'force-dynamic'

const STATUS: Record<WebChatError, number> = { disabled: 404, invalid: 400, session_unknown: 404, limit: 429, unavailable: 503 }
const TEXT: Record<WebChatError, string> = {
  disabled: 'Not found', invalid: 'Beskeden er tom eller for lang.', session_unknown: 'Chatten er udløbet — start en ny.',
  limit: 'Chatten har nået sit maksimum. Start en ny chat, eller skriv til os på mail.', unavailable: 'Beskeden kunne ikke registreres. Prøv igen om lidt.',
}

function keyOk(request: Request): boolean {
  const want = (process.env.RECEPTION_WEBCHAT_TEST_KEY ?? '').trim()
  if (!want) return true
  const got = (request.headers.get('x-elta-webchat-key') ?? '').trim()
  const a = Buffer.from(want), b = Buffer.from(got)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(request: Request) {
  if (!webChatEnabled() || !keyOk(request)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const raw = await request.text()
  if (raw.length > 8_000) return NextResponse.json({ error: TEXT.invalid }, { status: 413 })
  let body: Record<string, unknown>
  try { body = JSON.parse(raw) as Record<string, unknown> } catch { return NextResponse.json({ error: TEXT.invalid }, { status: 400 }) }
  const visitor = body.visitor && typeof body.visitor === 'object' ? body.visitor as Record<string, string> : undefined
  // Misbrugsværn: HMAC af IP'en (IP'en gemmes/logges aldrig); tællerne ligger i databasen (holdbart på tværs af instanser)
  const key = abuseKey(clientIp(request.headers))
  if (body.op === 'start') {
    const r = await startWebChat({ visitor, topic: String(body.topic ?? 'general'), abuseKey: key })
    return r.ok ? NextResponse.json({ token: r.token, greeting: r.greeting }) : NextResponse.json({ error: TEXT[r.error] }, { status: STATUS[r.error] })
  }
  if (body.op === 'message') {
    const r = await postWebChatMessage({ token: String(body.token ?? ''), text: String(body.text ?? ''), clientMessageId: typeof body.clientMessageId === 'string' ? body.clientMessageId : null, visitor, abuseKey: key })
    if (!r.ok) return NextResponse.json({ error: TEXT[r.error] }, { status: STATUS[r.error] })
    return NextResponse.json(r.duplicate ? { duplicate: true } : { reply: r.reply, handoff: r.handoff, urgent: r.urgency === 'emergency' || r.urgency === 'high' })
  }
  return NextResponse.json({ error: TEXT.invalid }, { status: 400 })
}
