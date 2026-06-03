/**
 * Phase 12A — shared rejection-service for offers.
 *
 * Bruges af baade portal-flow (src/lib/actions/portal.ts → rejectOffer)
 * og legacy public-flow (src/lib/actions/public-offer.ts →
 * rejectPublicOffer). Faelles normalisering + audit-meta-capture sikrer
 * at begge ruter skriver ens-formaterede data til DB.
 *
 * Server-only: importerer next/headers. Kalder ikke selv DB i trin 2 —
 * normalize + capture-meta-helpers er forberedelse til trin 3, hvor
 * actions selv vil kalde Supabase med det normaliserede output.
 *
 * Bagudkompatibilitet:
 *   - undefined            → { reason: 'other', note: null }
 *   - "" / whitespace      → { reason: 'other', note: null }
 *   - "free-text"          → { reason: 'other', note: 'free-text' }
 *   - OfferRejectionInput  → valideret + trimmet
 *
 * Invalid reason kaster ActionError('INVALID_REASON') — entry-actions
 * fanger og returnerer { success: false, error: 'Ugyldig afvisningsårsag' }.
 */

import { headers } from 'next/headers'
import { ActionError } from '@/lib/actions/action-helpers'
import {
  isRejectionReasonCode,
  REJECTION_NOTE_MAX_LENGTH,
  type OfferRejectionInput,
  type RejectionReasonCode,
} from '@/types/offers.types'

/**
 * Normaliseret resultat — alle felter er ikke-undefined; note/name/email
 * er enten en non-empty string eller null.
 */
export interface NormalizedRejection {
  reason: RejectionReasonCode
  note: string | null
  signerName: string | null
  signerEmail: string | null
}

/**
 * Audit-meta capture'et fra HTTP request. IP og UA er best-effort —
 * hvis headers() ikke returnerer dem (fx i unit-tests), faar vi 'unknown'.
 * Begge er truncated til rimelige laengder for DB-safety.
 */
export interface RejectionRequestMeta {
  ip: string
  userAgent: string
}

const NAME_MAX_LENGTH = 200
const EMAIL_MAX_LENGTH = 320 // RFC 5321
const USER_AGENT_MAX_LENGTH = 512
const IP_MAX_LENGTH = 64 // IPv6 + brackets med margin

function trimOrNull(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed.length === 0) return null
  return trimmed.slice(0, maxLength)
}

/**
 * Normaliser raw input fra begge entry-actions til en kanonisk form.
 *
 * Throws ActionError('INVALID_REASON') hvis et OfferRejectionInput-object
 * indeholder en ukendt reason-kode. Bagudkompatible string/undefined-input
 * defaulter til reason='other' og kaster aldrig.
 */
export function normalizeRejectionInput(
  raw: OfferRejectionInput | string | undefined | null,
): NormalizedRejection {
  // Bagudkompatibilitet: undefined eller null → 'other' uden note
  if (raw === undefined || raw === null) {
    return { reason: 'other', note: null, signerName: null, signerEmail: null }
  }

  // Bagudkompatibilitet: plain string fra gammel caller
  if (typeof raw === 'string') {
    return {
      reason: 'other',
      note: trimOrNull(raw, REJECTION_NOTE_MAX_LENGTH),
      signerName: null,
      signerEmail: null,
    }
  }

  // Struktureret input — validér reason
  if (!isRejectionReasonCode(raw.reason)) {
    throw new ActionError(
      `Ugyldig afvisningsårsag: ${String(raw.reason)}`,
      'INVALID_REASON',
      { received: raw.reason },
    )
  }

  return {
    reason: raw.reason,
    note: trimOrNull(raw.note, REJECTION_NOTE_MAX_LENGTH),
    signerName: trimOrNull(raw.signerName, NAME_MAX_LENGTH),
    signerEmail: trimOrNull(raw.signerEmail, EMAIL_MAX_LENGTH)?.toLowerCase() ?? null,
  }
}

/**
 * Hent IP + User-Agent fra Next.js headers() — best-effort.
 *
 * IP-strategi:
 *   1. foerste vaerdi i x-forwarded-for (Vercel edge convention)
 *   2. x-real-ip fallback
 *   3. 'unknown' hvis ingen header tilstede
 *
 * Bemaerk: vi stoler paa Vercel-edge til at saette x-forwarded-for
 * korrekt. Hvis en bruger spoofer headeren bag en proxy, faar vi
 * den spoofede vaerdi — det er best-effort audit, ikke security guard.
 */
export async function captureRejectionMeta(): Promise<RejectionRequestMeta> {
  const h = await headers()
  const ipRaw =
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    h.get('x-real-ip')?.trim() ||
    'unknown'
  const uaRaw = h.get('user-agent')?.trim() || 'unknown'
  return {
    ip: ipRaw.slice(0, IP_MAX_LENGTH),
    userAgent: uaRaw.slice(0, USER_AGENT_MAX_LENGTH),
  }
}
