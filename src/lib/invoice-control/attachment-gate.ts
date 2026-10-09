/**
 * Vedhaeftnings-hentning til leverandoerfakturaer (fakturapipeline). Bevidst IKKE 'use server'.
 *
 * Fund (prod, read-only 2026-09-29): 43 af 50 faktura-mails HAR vedhaeftninger, men kun 1 har attachment_urls —
 * mail-synk gemmer dem ikke, saa faktura-PDF'en laeses aldrig, og alt parses fra mailens broedtekst
 * (44 needs_review, 6 fejlet). Den eksisterende mekanisme processEmailAttachments() (Graph -> storage) bruges kun
 * ved manuel backfill.
 *
 * INVOICE_ATTACHMENT_FETCH_ENABLED (default OFF): naar TIL, henter faktura-indlaesningen mailens vedhaeftninger
 * via Graph (LAESNING fra postkassen + upload til privat storage) foer parsing. Fejl -> sikker fallback til
 * broedtekst (samme adfaerd som i dag). Aktivering aendrer en eksisterende crons adfaerd -> Henriks beslutning.
 */
export function isInvoiceAttachmentFetchEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.INVOICE_ATTACHMENT_FETCH_ENABLED === 'true'
}

export interface AttachmentState {
  has_attachments: boolean | null
  attachment_urls: unknown
  graph_message_id: string | null
}

/** Skal vedhaeftninger hentes foer parsing? Ren funktion. */
export function shouldFetchAttachments(email: AttachmentState, enabled: boolean): boolean {
  if (!enabled || !email.has_attachments || !email.graph_message_id) return false
  // Hentet = storagePath (gemte links blankes); ældre rækker kan kun have url
  const urls = Array.isArray(email.attachment_urls) ? (email.attachment_urls as Array<{ url?: string; storagePath?: string }>) : []
  return !urls.some((u) => (typeof u?.storagePath === 'string' && u.storagePath.length > 0) || (typeof u?.url === 'string' && u.url.length > 0))
}
