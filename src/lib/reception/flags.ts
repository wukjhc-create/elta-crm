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

/**
 * Fase 3A — ét flag PR. AKTIVERINGSTRIN (ingen fælles hovedafbryder; hvert trin kan rulles tilbage alene):
 *   A  RECEPTION_EMAIL_INGEST_ENABLED=true    nye indgående mails (efter mail-sync'ens kobling) → Henvendelser (kun forslag)
 *   B  RECEPTION_PORTAL_INGEST_ENABLED=true   nye kundebeskeder i portalen → Henvendelser (kun forslag)
 *   C  historisk afgrænset backfill: INTET flag — en medarbejder med conversations.manage trykker "Hent nye fra mail/portal"
 *      (syncHenvendelserFromSources: højst 14 dage, højst 50 pr. kanal, kun forslag, brugerens egen RLS). Kun efter godkendelse.
 *   D  RECEPTION_WEBCHAT_ENABLED=true         ELTAs web-chat (test-URL /webchat-test + /api/webchat). Standard FRA; prod FRA
 *      RECEPTION_WEBCHAT_AI_REPLY_ENABLED=true  chat-svar må formuleres af den fælles AI-klient (kun ud fra vidensbasen;
 *                                            efterkontrolleres; ellers fast skabelon). Kræver også D.
 *   E  RECEPTION_WEBCHAT_PUBLIC=true          offentlig chat (widget på eltasolar.dk). Kræver D. Ikke bygget i 3A.
 * RECEPTION_BACKGROUND_ENABLED (fase 2) gælder fortsat kun for andre baggrunds-kanaler (fx telefon).
 */
export function emailIngestEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return on(env.RECEPTION_EMAIL_INGEST_ENABLED)
}
export function portalIngestEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return on(env.RECEPTION_PORTAL_INGEST_ENABLED)
}
export function webChatEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return on(env.RECEPTION_WEBCHAT_ENABLED)
}
export function webChatAiReplyEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return webChatEnabled(env) && on(env.RECEPTION_WEBCHAT_AI_REPLY_ENABLED)
}

/** Hvilket flag en baggrunds-indtagelse kræver (ingen hovedafbryder) */
export type IntakeGate = 'background' | 'email' | 'portal' | 'webchat'
export function intakeGateEnabled(gate: IntakeGate, env: Record<string, string | undefined> = process.env): boolean {
  switch (gate) {
    case 'email': return emailIngestEnabled(env)
    case 'portal': return portalIngestEnabled(env)
    case 'webchat': return webChatEnabled(env)
    default: return receptionBackgroundEnabled(env)
  }
}

/**
 * Ekstern afsendelse (SMS/mail/opkald) findes ikke: altid false, bevidst ingen env-nøgle. Web-chattens svar vises KUN i
 * chat-vinduet, som den besøgende selv har åbnet (staging), og er ikke en udgående besked til kunden.
 */
export const EXTERNAL_SENDS_ENABLED = false as const
