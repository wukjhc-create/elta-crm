/**
 * Relatel webhook-signatur (officiel model, "Webhooks in Relatel" kundeguide aug. 2026, s. 8–11). Bevidst IKKE 'use server'.
 *
 *   Relatel-Signature: t=<unix-sek>,v1=<hex>[,v1=<hex>]   (flere v1 under nøglerotation — accepter hvis ÉN passer)
 *   v1 = hex(HMAC-SHA256(signeringsnøgle, `${t}.${rå krop}`))  — den rå krop præcis som modtaget
 *   Afvis forældede leveringer: |nu − t| > 300 s (Relatels anbefaling: højst 5 minutter)
 *
 * Nøgler: RELATEL_WEBHOOK_SIGNING_KEY (+ evt. RELATEL_WEBHOOK_SIGNING_KEY_PREVIOUS i rotationens 24 timer).
 * Sammenligning er tidskonstant (safeEqual). Nøgler og signaturer logges/returneres aldrig.
 */
import { createHmac } from 'crypto'
import { safeEqual } from '@/lib/security/safe-equal'

export const RELATEL_SIGNATURE_TOLERANCE_SECONDS = 300

export type SignatureCheck =
  | { ok: true }
  | { ok: false; reason: 'missing_header' | 'malformed_header' | 'stale' | 'timestamp_mismatch' | 'mismatch' | 'no_key' }

export function relatelSigningKeys(env: Record<string, string | undefined>): string[] {
  return [env.RELATEL_WEBHOOK_SIGNING_KEY, env.RELATEL_WEBHOOK_SIGNING_KEY_PREVIOUS]
    .map((k) => (k ?? '').trim())
    .filter((k) => k.length > 0)
}

export function parseSignatureHeader(header: string | null | undefined): { t: number; v1: string[] } | null {
  if (!header || header.length > 2048) return null
  let t: number | null = null
  const v1: string[] = []
  for (const part of header.split(',')) {
    const i = part.indexOf('=')
    if (i <= 0) return null
    const k = part.slice(0, i).trim()
    const v = part.slice(i + 1).trim()
    if (k === 't') {
      if (!/^\d{1,12}$/.test(v) || t !== null) return null
      t = Number(v)
    } else if (k === 'v1') {
      if (!/^[0-9a-f]{64}$/i.test(v)) return null
      v1.push(v.toLowerCase())
    }
    // ukendte segmenter (fremtidige versioner) ignoreres — kun v1 kan godkende
  }
  if (t === null || v1.length === 0) return null
  return { t, v1 }
}

export function signRelatelBody(key: string, timestamp: number, rawBody: string): string {
  return createHmac('sha256', key).update(`${timestamp}.${rawBody}`, 'utf8').digest('hex')
}

export function verifyRelatelSignature(input: {
  rawBody: string
  signatureHeader: string | null | undefined
  timestampHeader?: string | null
  keys: string[]
  nowSeconds: number
}): SignatureCheck {
  if (input.keys.length === 0) return { ok: false, reason: 'no_key' }
  if (!input.signatureHeader) return { ok: false, reason: 'missing_header' }
  const parsed = parseSignatureHeader(input.signatureHeader)
  if (!parsed) return { ok: false, reason: 'malformed_header' }
  // Relatel-Timestamp skal (når den er sendt) være samme tidspunkt som det signerede t
  if (input.timestampHeader != null && input.timestampHeader !== '' && input.timestampHeader.trim() !== String(parsed.t)) {
    return { ok: false, reason: 'timestamp_mismatch' }
  }
  if (Math.abs(input.nowSeconds - parsed.t) > RELATEL_SIGNATURE_TOLERANCE_SECONDS) return { ok: false, reason: 'stale' }
  for (const key of input.keys) {
    const expected = signRelatelBody(key, parsed.t, input.rawBody)
    if (parsed.v1.some((sig) => safeEqual(sig, expected))) return { ok: true }
  }
  return { ok: false, reason: 'mismatch' }
}
