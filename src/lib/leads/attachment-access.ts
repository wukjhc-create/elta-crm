/**
 * LD-1 (leads-review 2026-10-18): må en sti fra leadets custom_fields.attachments signeres? Ren logik (ingen I/O).
 *
 * custom_fields kan skrives af flere roller (RLS), så listen alene er ingen adgangsnøgle:
 *  - leadets egen kopi skal ligge under lead-attachments/<leadId>/
 *  - en kildesti skal stå på leadets EGEN kildemail (attachment_urls[].storagePath)
 */
export interface LeadAttachmentRef { leadStoragePath?: string; sourcePath?: string }

export function isSafeStoragePath(path: string): boolean {
  return !!path && !path.includes('..') && !path.startsWith('/')
}

/** Leadets egen kopi: listet som leadStoragePath og under leadets mappe. */
export function leadCopyAllowed(leadId: string, storagePath: string, atts: LeadAttachmentRef[]): boolean {
  return isSafeStoragePath(storagePath) && storagePath.startsWith(`lead-attachments/${leadId}/`)
    && atts.some((a) => a.leadStoragePath === storagePath)
}

/** Kildesti: listet som sourcePath OG findes blandt kildemailens gemte vedhæftninger. */
export function sourcePathAllowed(storagePath: string, atts: LeadAttachmentRef[], mailAttachments: unknown): boolean {
  if (!isSafeStoragePath(storagePath) || !atts.some((a) => a.sourcePath === storagePath)) return false
  return Array.isArray(mailAttachments) && mailAttachments.some((m) => (m as { storagePath?: unknown } | null)?.storagePath === storagePath)
}
