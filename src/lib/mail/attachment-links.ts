/**
 * Mail-vedhæftninger: friske, kortlivede links i stedet for de 1-års signerede links, der tidligere blev gemt i
 * incoming_emails.attachment_urls. Prod 2026-10-09 (`prod-mail-attachment-url-kinds.ts`): alle 123 gemte links var
 * `/object/public/`-links til den PRIVATE bucket → virkede ikke (mail-UI'et viste døde links). Filen identificeres af
 * storagePath; `url` i databasen bruges ikke længere til adgang.
 *
 * Server-only (signerer med service-klienten bag kaldende actions' permission-gates).
 */
import { getStorageSignedUrlOrNull, SIGNED_URL_TTL } from '@/lib/storage/signed-url'

export type MailAttachment = {
  filename: string
  contentType?: string
  size?: number
  url?: string
  storagePath?: string
}

export function attachmentList(raw: unknown): MailAttachment[] {
  return Array.isArray(raw) ? (raw as MailAttachment[]).filter((a) => !!a && typeof a === 'object') : []
}

/** Er vedhæftningen hentet til storage? (storagePath; ældre rækker kan kun have url) */
export function hasStoredFile(a: { url?: string | null; storagePath?: string | null }): boolean {
  return (!!a.storagePath && a.storagePath.length > 0) || (!!a.url && a.url.length > 0)
}

/**
 * Kun stier i mailens egen mappe må signeres (attachment_urls er data, ikke en adgangsnøgle): indgående
 * `email-attachments/<mail-id>/`, udgående spejl `outbound-attachments/<mailens kunde-id>/`.
 */
function ownsPath(emailId: string, customerId: string | null | undefined, path: string | undefined): path is string {
  if (!path || path.includes('..')) return false
  if (path.startsWith(`email-attachments/${emailId}/`)) return true
  return !!customerId && path.startsWith(`outbound-attachments/${customerId}/`)
}

/** Til lister: fjern gemte links (listen viser ikke filerne; detaljen signerer friskt). */
export function withoutAttachmentLinks(raw: unknown): MailAttachment[] {
  return attachmentList(raw).map((a) => ({ ...a, url: '' }))
}

/** Til detaljevisning: signér et friskt link (1 time) pr. hentet vedhæftning. */
export async function withFreshAttachmentLinks(
  emailId: string,
  raw: unknown,
  customerId?: string | null
): Promise<MailAttachment[]> {
  return Promise.all(
    attachmentList(raw).map(async (a) => {
      if (!ownsPath(emailId, customerId, a.storagePath)) return { ...a, url: '' }
      const url = await getStorageSignedUrlOrNull('attachments', a.storagePath, SIGNED_URL_TTL.SHORT)
      return { ...a, url: url ?? '' }
    })
  )
}
