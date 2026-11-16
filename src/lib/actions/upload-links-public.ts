'use server'

/**
 * OFFENTLIG upload via engangs-link (AI-receptionist fase 2). Ingen login — adgangen er ALENE et gyldigt token
 * (validateUploadToken: SHA-256-opslag, ikke udløbet, ikke tilbagekaldt, kvote tilbage) og flaget
 * RECEPTION_UPLOAD_LINKS_ENABLED. Service-role bruges KUN efter token-validering og kun til: upload_requests (kvote),
 * storage 'attachments', customer_documents (interne dokumenter), conversation_items/conversations (henvendelsen), audit.
 * Returnerer aldrig kundedata — kun antal modtagne filer eller en neutral fejltekst.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { acceptUploadFiles, UPLOAD_REASON_TEXT, validateUploadToken, type AcceptedFile } from '@/lib/reception/upload-links'

export async function submitUploadLinkFiles(token: string, formData: FormData): Promise<{ success: true; accepted: number } | { success: false; error: string }> {
  const admin = createAdminClient()
  const check = await validateUploadToken(admin, token)
  if (!check.ok) return { success: false, error: UPLOAD_REASON_TEXT[check.reason] }
  const raw = formData.getAll('files').filter((f): f is File => typeof f === 'object' && f !== null && 'arrayBuffer' in f)
  if (raw.length > 20) return { success: false, error: 'For mange filer på én gang. Intet er uploadet.' }
  const files: AcceptedFile[] = []
  for (const f of raw) files.push({ name: f.name, type: f.type || '', size: f.size, bytes: Buffer.from(await f.arrayBuffer()) })
  const r = await acceptUploadFiles(admin, check.request, files)
  return r.ok ? { success: true, accepted: r.accepted } : { success: false, error: r.error }
}

/** Kun linkets tilstand (ingen kundedata) til siden */
export async function getUploadLinkState(token: string): Promise<{ ok: true; remaining: number } | { ok: false; error: string }> {
  const check = await validateUploadToken(createAdminClient(), token)
  if (!check.ok) return { ok: false, error: UPLOAD_REASON_TEXT[check.reason] }
  return { ok: true, remaining: check.request.max_files - check.request.files_uploaded }
}
