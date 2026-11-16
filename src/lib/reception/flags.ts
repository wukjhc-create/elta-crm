/**
 * AI-receptionist fase 2 — flag. Bevidst IKKE 'use server'. Alt er FRA som standard.
 *
 *  RECEPTION_LLM_ENABLED=true            engine bruger den fælles AI-klient til intent (ellers kun nøgleord)
 *  RECEPTION_UPLOAD_LINKS_ENABLED=true   kontoret kan oprette engangs-upload-links, og /upload/[token] tager imod filer
 *
 * Ekstern afsendelse (SMS/mail/opkald) findes IKKE i fase 2 — der er ingen afsender og intet flag, der kan slå den til.
 */
const on = (v: string | undefined) => (v ?? '').trim().toLowerCase() === 'true'

export function receptionLlmEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return on(env.RECEPTION_LLM_ENABLED)
}

export function uploadLinksEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return on(env.RECEPTION_UPLOAD_LINKS_ENABLED)
}

/**
 * RECEPTION_BACKGROUND_ENABLED=true — baggrundsaktøren (uden indlogget medarbejder: nat/weekend-telefon, web-chat,
 * portal, udbyder-webhooks) må indtage som FORSLAG via reception_ingest. Intet kalder den endnu (fase 3 kobler den på).
 */
export function receptionBackgroundEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return on(env.RECEPTION_BACKGROUND_ENABLED)
}

/** Fase 2: altid false. Bevidst ingen env-nøgle. */
export const EXTERNAL_SENDS_ENABLED = false as const
