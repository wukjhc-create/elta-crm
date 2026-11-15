/**
 * MIDLERTIDIG diagnose af AFVISTE Relatel-leveringer (2026-11-15: testlevering gav 401). Bevidst IKKE 'use server'.
 *
 * Returnerer KUN strukturmetadata — aldrig nøglen, signaturværdien, kroppen eller persondata:
 *  - header-NAVNE (højst 40), content-type, kroppens bytelængde
 *  - Relatel-Signature: længde, segment-nøgler (t/v1/…), antal v1, hver v1's længde og tegnklasse (hex/base64/andet),
 *    om t er heltal, antal cifre, forskydning i sekunder mod serverens ur
 *  - Relatel-Timestamp: til stede, heltal, cifre, = t?
 *  - Relatel-Delivery-Id: til stede, = body.delivery_id?
 *  - godkendelsestilstand og nøgle-FINGERPRINT (første 8 hex af SHA-256 af nøglen — samme fingerprint som Relatel selv
 *    viser i webhook-siden og beskriver som sikkert at dele) + om nøglen har whitespace/anførselstegn omkring sig
 *  - hvilket trin der afviste
 * Fjernes igen, når leveringen er verificeret.
 */
import { createHash } from 'crypto'
import { parseSignatureHeader, RELATEL_SIGNATURE_TOLERANCE_SECONDS } from './signature'

export interface RejectionDiagnosticInput {
  headerNames: string[]
  contentType: string | null
  signature: string | null
  timestamp: string | null
  deliveryId: string | null
  rawBody: string
  nowSeconds: number
  status: number
  stage: string
  authMode: string
  env: Record<string, string | undefined>
}

const charClass = (s: string) => (/^[0-9a-f]+$/.test(s) ? 'hex_lower' : /^[0-9A-F]+$/.test(s) ? 'hex_upper' : /^[0-9a-fA-F]+$/.test(s) ? 'hex_mixed' : /^[A-Za-z0-9+/=]+$/.test(s) ? 'base64' : /^[A-Za-z0-9_=-]+$/.test(s) ? 'base64url' : 'other')

export function keyFingerprint(key: string): string {
  return createHash('sha256').update(key, 'utf8').digest('hex').slice(0, 8)
}

function keyInfo(raw: string | undefined) {
  if (raw == null || raw === '') return { present: false }
  const trimmed = raw.trim()
  return {
    present: true,
    length: raw.length,
    trimmed_length: trimmed.length,
    has_outer_whitespace: raw !== trimmed,
    has_quotes: /^["'].*["']$/.test(trimmed),
    fingerprint_trimmed: keyFingerprint(trimmed),
    // hvis nøglen er gemt med anførselstegn, er dette fingerprintet uden dem (til sammenligning med Relatels side)
    ...(/^["'].*["']$/.test(trimmed) ? { fingerprint_without_quotes: keyFingerprint(trimmed.slice(1, -1)) } : {}),
  }
}

export function relatelRejectionDiagnostic(i: RejectionDiagnosticInput): Record<string, unknown> {
  const sig = i.signature ?? ''
  const segments = sig ? sig.split(',').map((p) => p.trim()) : []
  const parsed = parseSignatureHeader(i.signature)
  const tMatch = sig.match(/(?:^|,)\s*t=([^,]*)/)
  const tRaw = tMatch ? tMatch[1].trim() : null
  const tNum = tRaw && /^\d+$/.test(tRaw) ? Number(tRaw) : null
  const v1s = segments.filter((p) => p.startsWith('v1=')).map((p) => p.slice(3))
  let bodyDeliveryId: string | null = null
  try {
    const b = JSON.parse(i.rawBody) as Record<string, unknown>
    bodyDeliveryId = typeof b?.delivery_id === 'string' ? b.delivery_id : null
  } catch { /* ikke JSON */ }
  return {
    stage: i.stage,
    http_status: i.status,
    auth_mode: i.authMode,
    header_names: i.headerNames.map((h) => h.toLowerCase().slice(0, 64)).sort().slice(0, 40),
    content_type: (i.contentType ?? '').slice(0, 80),
    body_bytes: Buffer.byteLength(i.rawBody, 'utf8'),
    body_is_json: bodyDeliveryId !== null || (() => { try { JSON.parse(i.rawBody); return true } catch { return false } })(),
    signature: {
      present: sig.length > 0,
      length: sig.length,
      segment_keys: segments.map((p) => (p.includes('=') ? p.slice(0, p.indexOf('=')).slice(0, 8) : '?')),
      has_spaces: /\s/.test(sig),
      v1_count: v1s.length,
      v1_lengths: v1s.map((v) => v.length),
      v1_charset: v1s.map(charClass),
      t_is_integer: tNum !== null,
      t_digits: tRaw ? tRaw.length : 0,
      t_skew_seconds: tNum !== null ? i.nowSeconds - tNum : null,
      t_within_window: tNum !== null ? Math.abs(i.nowSeconds - tNum) <= RELATEL_SIGNATURE_TOLERANCE_SECONDS : null,
      parses_as_expected: parsed !== null,
    },
    timestamp_header: {
      present: !!i.timestamp,
      is_integer: !!i.timestamp && /^\d+$/.test(i.timestamp.trim()),
      digits: i.timestamp ? i.timestamp.trim().length : 0,
      equals_t: !!i.timestamp && tRaw !== null && i.timestamp.trim() === tRaw,
    },
    delivery_id: {
      header_present: !!i.deliveryId,
      body_present: bodyDeliveryId !== null,
      header_equals_body: !!i.deliveryId && bodyDeliveryId !== null && i.deliveryId.trim() === bodyDeliveryId,
    },
    keys: {
      current: keyInfo(i.env.RELATEL_WEBHOOK_SIGNING_KEY),
      previous: keyInfo(i.env.RELATEL_WEBHOOK_SIGNING_KEY_PREVIOUS),
      static_secret_present: !!(i.env.RELATEL_WEBHOOK_SECRET ?? '').trim(),
    },
  }
}

/** Rate-grænse pr. serverinstans: højst `max` diagnoserækker pr. vindue (anonymt endpoint → ingen skrive-forstærkning) */
export function createDiagnosticLimiter(max = 20, windowMs = 10 * 60_000, now: () => number = Date.now) {
  let windowStart = now()
  let count = 0
  return () => {
    const t = now()
    if (t - windowStart > windowMs) { windowStart = t; count = 0 }
    if (count >= max) return false
    count++
    return true
  }
}
