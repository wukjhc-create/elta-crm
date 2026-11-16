/**
 * Engangs-upload-link (AI-receptionist fase 2). Server-only — bevidst IKKE 'use server' og aldrig importeret i klientkode.
 *
 *  - Tokenet (32 tilfældige bytes, base64url) vises ÉN gang for medarbejderen; kun SHA-256 gemmes (upload_requests.token_hash,
 *    som authenticated ikke kan læse). Linket sendes IKKE af systemet i fase 2.
 *  - Et gyldigt link giver KUN ret til at uploade filer til netop den kunde/sag — ingen visning af kundedata, ingen portal.
 *  - Udløb ≤ 14 dage (DB-CHECK), filloft pr. link (DB-CHECK), tilbagekaldelse, kun billeder/PDF (indholdet tjekkes),
 *    max 9 MB samlet pr. afsendelse (server-action-grænsen er 10 MB).
 *  - Filerne gemmes som INTERNE kundedokumenter (ikke delt i portalen) via samme lager/sti-konvention som uploadCaseDocument.
 * Den offentlige upload kører med service-role EFTER token-validering (som kundeportalen) — kun disse to tabeller + storage.
 */
import { createHash, randomBytes } from 'crypto'

/** Review-fund H4: server-actions har bodySizeLimit 10 MB (next.config) — derfor 9 MB SAMLET pr. afsendelse */
export const UPLOAD_MAX_BYTES = 9 * 1024 * 1024
export const UPLOAD_MAX_TOTAL_BYTES = 9 * 1024 * 1024
export const UPLOAD_MIME = /^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/
export const UPLOAD_LINK_DAYS = 7

export function newUploadToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url')
  return { token, hash: hashUploadToken(token) }
}

export function hashUploadToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export function isWellFormedUploadToken(token: string | null | undefined): token is string {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token)
}

export interface UploadRequestRow {
  id: string; conversation_id: string | null; customer_id: string; service_case_id: string | null
  expires_at: string; max_files: number; files_uploaded: number; revoked_at: string | null; created_by: string | null
  /** Final review: ÉN afsendelse pr. link — sat ved reservationen */
  consumed_at?: string | null
}

export type UploadTokenCheck =
  | { ok: true; request: UploadRequestRow }
  | { ok: false; reason: 'disabled' | 'invalid' | 'expired' | 'revoked' | 'consumed' | 'quota_used' | 'read_error' }

/** Rent tjek af en allerede læst række (testbart) */
export function checkUploadRequest(row: UploadRequestRow | null, now: Date): UploadTokenCheck {
  if (!row) return { ok: false, reason: 'invalid' }
  if (row.revoked_at) return { ok: false, reason: 'revoked' }
  if (Date.parse(row.expires_at) <= now.getTime()) return { ok: false, reason: 'expired' }
  if (row.consumed_at) return { ok: false, reason: 'consumed' }
  if (row.files_uploaded >= row.max_files) return { ok: false, reason: 'quota_used' }
  return { ok: true, request: row }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export async function validateUploadToken(admin: Db, token: string | null | undefined, now = new Date()): Promise<UploadTokenCheck> {
  const { uploadLinksEnabled } = await import('./flags')
  if (!uploadLinksEnabled()) return { ok: false, reason: 'disabled' }
  if (!isWellFormedUploadToken(token)) return { ok: false, reason: 'invalid' }
  const { data, error } = await admin.from('upload_requests')
    .select('id, conversation_id, customer_id, service_case_id, expires_at, max_files, files_uploaded, consumed_at, revoked_at, created_by')
    .eq('token_hash', hashUploadToken(token)).maybeSingle()
  if (error) return { ok: false, reason: 'read_error' }
  return checkUploadRequest(data as UploadRequestRow | null, now)
}

export const UPLOAD_REASON_TEXT: Record<Exclude<UploadTokenCheck, { ok: true }>['reason'], string> = {
  disabled: 'Upload via link er ikke slået til.',
  invalid: 'Linket er ugyldigt.',
  expired: 'Linket er udløbet. Kontakt Elta Solar for et nyt link.',
  revoked: 'Linket er lukket. Kontakt Elta Solar for et nyt link.',
  consumed: 'Linket er allerede brugt. Kontakt Elta Solar, hvis du vil sende flere filer.',
  quota_used: 'Der er allerede uploadet det maksimale antal filer via dette link.',
  read_error: 'Linket kunne ikke kontrolleres lige nu. Prøv igen om lidt — intet er uploadet.',
}

export interface AcceptedFile { name: string; type: string; size: number; bytes: Buffer }

/** Review-fund L1: filens indhold skal passe til den oplyste type (klientens MIME stoles ikke på) */
export function contentMatchesType(type: string, b: Buffer): boolean {
  const head = (n: number) => b.subarray(0, n)
  if (type === 'image/jpeg') return b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
  if (type === 'image/png') return head(8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  if (type === 'image/webp') return head(4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP'
  if (type === 'application/pdf') return head(5).toString('latin1') === '%PDF-'
  // HEIC/HEIF: ISO-BMFF 'ftyp' + en HEIF-brand (en vilkårlig MP4/MOV afvises)
  if (type === 'image/heic' || type === 'image/heif') return b.subarray(4, 8).toString('latin1') === 'ftyp' && HEIF_BRANDS.has(b.subarray(8, 12).toString('latin1'))
  return false
}

const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'])

/** Filendelsen afledes af den KONTROLLEREDE type — aldrig af kundens filnavn */
export const UPLOAD_EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif', 'application/pdf': 'pdf' }

/** Visningsnavn: ingen sti-dele, kontrol- eller retningstegn (RTL-override kan forklæde endelser), endelse fra typen */
export function safeUploadName(name: string, type: string): string {
  const base = String(name ?? '').split(/[\\/]/).pop() ?? ''
  const clean = base.normalize('NFC').replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, '').replace(/\s+/g, ' ').trim()
  const stem = clean.replace(/\.[^.]*$/, '').slice(0, 100) || 'fil'
  return `${stem}.${UPLOAD_EXT[type] ?? 'bin'}`
}

export type UploadOutcome = { ok: true; accepted: number; documentIds: string[] } | { ok: false; error: string }

/** Gem filerne (service-role, efter token-validering). Hver fil: storage → dokumentrække → kvote (optimistisk lås) → item. */
export async function acceptUploadFiles(admin: Db, req: UploadRequestRow, files: AcceptedFile[]): Promise<UploadOutcome> {
  if (!files.length) return { ok: false, error: 'Vælg mindst én fil.' }
  if (req.consumed_at) return { ok: false, error: UPLOAD_REASON_TEXT.consumed }
  if (files.length > req.max_files) return { ok: false, error: `Højst ${req.max_files} filer via dette link.` }
  for (const f of files) {
    if (f.size <= 0 || f.size > UPLOAD_MAX_BYTES || f.bytes.length !== f.size) return { ok: false, error: 'En fil er tom eller for stor (max 9 MB). Intet er uploadet.' }
    if (!UPLOAD_MIME.test(f.type) || !contentMatchesType(f.type, f.bytes)) return { ok: false, error: 'Kun billeder (JPG, PNG, WEBP, HEIC) og PDF. Intet er uploadet.' }
  }
  if (files.reduce((n, f) => n + f.size, 0) > UPLOAD_MAX_TOTAL_BYTES) return { ok: false, error: 'Filerne fylder for meget på én gang (max 9 MB samlet). Upload dem i flere omgange. Intet er uploadet.' }
  // Final review: linket FORBRUGES atomisk FØR filerne gemmes (én afsendelse pr. link). Et samtidigt eller gentaget
  // kald (replay) rammer 0 rækker og afvises. Kun hvis INTET blev gemt, frigives linket igen.
  const reservedAt = new Date().toISOString()
  const reserve = await admin.from('upload_requests').update({ files_uploaded: files.length, consumed_at: reservedAt })
    .eq('id', req.id).is('consumed_at', null).is('revoked_at', null).gt('expires_at', reservedAt).select('id')
  if (reserve.error || !(reserve.data ?? []).length) return { ok: false, error: 'Linket er allerede brugt eller lukket. Intet er uploadet.' }

  const documentIds: string[] = []
  const refund = async () => {
    if (documentIds.length === 0) {
      await admin.from('upload_requests').update({ files_uploaded: 0, consumed_at: null }).eq('id', req.id).eq('consumed_at', reservedAt)
    } else if (documentIds.length < files.length) {
      await admin.from('upload_requests').update({ files_uploaded: documentIds.length }).eq('id', req.id).eq('consumed_at', reservedAt)
    }
  }
  // Review-fund H3: filer knyttes kun til henvendelsen, hvis dens bekræftede kunde stadig er linkets kunde
  let attachConversation: string | null = null
  if (req.conversation_id) {
    const cv = await admin.from('conversations').select('customer_id').eq('id', req.conversation_id).maybeSingle()
    if (!cv.error && (cv.data as { customer_id: string | null } | null)?.customer_id === req.customer_id) attachConversation = req.conversation_id
  }
  for (const [i, f] of files.entries()) {
    const path = `customer-documents/${req.customer_id}/upload-${req.id}-${Date.now()}-${i}.${UPLOAD_EXT[f.type] ?? 'bin'}`
    const up = await admin.storage.from('attachments').upload(path, f.bytes, { contentType: f.type, upsert: false })
    if (up.error) { await refund(); return { ok: false, error: `Upload fejlede efter ${documentIds.length} fil(er). Prøv igen med resten.` } }
    const safeName = safeUploadName(f.name, f.type)
    const doc = await admin.from('customer_documents').insert({
      customer_id: req.customer_id, service_case_id: req.service_case_id, title: safeName, document_type: 'other',
      file_url: '', storage_path: path, file_name: safeName, mime_type: f.type, file_size: f.size, shared_by: req.created_by,
    }).select('id').single()
    if (doc.error || !doc.data) {
      await admin.storage.from('attachments').remove([path])
      await refund()
      return { ok: false, error: `Upload fejlede efter ${documentIds.length} fil(er). Prøv igen med resten.` }
    }
    documentIds.push((doc.data as { id: string }).id)
    if (attachConversation) {
      // Item-værnet (00249) kræver: kun service_role, dokumentet tilhører henvendelsens bekræftede kunde, kanonisk nøgle
      await admin.from('conversation_items').insert({
        conversation_id: attachConversation, channel: 'upload_link', direction: 'inbound', provider: 'upload_link',
        source_table: 'customer_documents', source_id: (doc.data as { id: string }).id, occurred_at: new Date().toISOString(),
        title: 'Kunden har uploadet en fil', body_preview: null, sender_label: null,
        attachment_document_ids: [(doc.data as { id: string }).id], dedupe_key: `upload:customer_documents:${(doc.data as { id: string }).id}`,
        created_by: req.created_by,
      })
    }
  }
  if (attachConversation) {
    await admin.from('conversations').update({ last_at: new Date().toISOString(), status: 'open', next_action: 'Kunden har uploadet filer — vurder dem' })
      .eq('id', attachConversation).neq('status', 'handled')
  }
  await admin.from('audit_logs').insert({ user_id: null, entity_type: 'upload_request', entity_id: req.id, action: 'upload_link_files_received',
    action_description: `${files.length} fil(er) modtaget via upload-link`, metadata: { customer_id: req.customer_id, service_case_id: req.service_case_id, document_ids: documentIds } })
  return { ok: true, accepted: documentIds.length, documentIds }
}
