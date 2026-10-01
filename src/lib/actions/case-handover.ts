'use server'

/**
 * Aflevering på sagen (N9a): afslutnings-tjekliste, fotos pr. punkt og kundens underskrift — på ordresiden, hvor
 * montøren arbejder. Samme datamodel som Service-modulet (service_cases.checklist, service_case_attachments med
 * category = punktets key, customer_signature*), så eksisterende data vises begge steder.
 *
 * Adgang: kontor (cases.edit) eller montør på EGNE sager (cases.edit.own + case-scope). RLS tillader ikke montør at
 * rette service_cases/indsætte bilag → skrivninger sker med service-role EFTER tjekket og kun på de konkrete kolonner.
 * Klienten sender aldrig hele tjeklisten — kun "punkt X er/er ikke udført". Underskriften lukker IKKE sagen.
 */
import { revalidatePath } from 'next/cache'
import { getAuthenticatedClientWithRole, formatError } from '@/lib/actions/action-helpers'
import { validateUUID } from '@/lib/validations/common'
import { logger } from '@/lib/utils/logger'
import { DEFAULT_CHECKLIST, canCloseCase, type ChecklistItem, type ServiceCaseAttachment } from '@/types/service-cases.types'
import type { ActionResult } from '@/types/common.types'

const PHOTO_MAX_BYTES = 15 * 1024 * 1024
const PHOTO_MIME = /^image\/(jpeg|png|webp|heic|heif)$/i
const SIGNATURE_MAX_CHARS = 600_000 // ~450 KB PNG som data-URL

export interface CaseHandover {
  checklist: ChecklistItem[]
  attachments: ServiceCaseAttachment[]
  signature: { image: string | null; name: string | null; signed_at: string | null }
  canEdit: boolean
  canClose: boolean
}

/** Læse- og skriveadgang til sagens aflevering for den aktuelle bruger. */
type Ctx = Awaited<ReturnType<typeof getAuthenticatedClientWithRole>>
async function handoverAccess(ctx: Ctx, caseId: string) {
  validateUUID(caseId, 'sags-ID')
  const { userCanViewCase } = await import('@/lib/auth/case-scope')
  const all = ctx.hasPermission('cases.view.all')
  const inScope = all || (ctx.hasPermission('cases.view.assigned') && (await userCanViewCase(caseId, { supabase: ctx.supabase, userId: ctx.userId, role: ctx.role })))
  const canEdit = ctx.hasPermission('cases.edit') || (ctx.hasPermission('cases.edit.own') && inScope)
  return { ctx, canView: inScope, canEdit }
}

async function admin() {
  const { createAdminClient } = await import('@/lib/supabase/admin')
  return createAdminClient()
}

function revalidateCase(caseId: string) {
  revalidatePath(`/dashboard/orders/${caseId}`)
  revalidatePath(`/dashboard/service-cases/${caseId}`)
}

export async function getCaseHandoverAction(caseId: string): Promise<ActionResult<CaseHandover>> {
  try {
    const ctx = await getAuthenticatedClientWithRole()
    const { canView, canEdit } = await handoverAccess(ctx, caseId)
    if (!canView) return { success: false, error: 'Ingen adgang til sagen' }
    const db = await admin()
    const { data: sc } = await db.from('service_cases').select('checklist, customer_signature, customer_signature_name, signed_at').eq('id', caseId).maybeSingle()
    if (!sc) return { success: false, error: 'Sag ikke fundet' }
    const { data: rows } = await db.from('service_case_attachments').select('*').eq('service_case_id', caseId).order('created_at', { ascending: true })
    const atts = (rows ?? []) as ServiceCaseAttachment[]
    const paths = atts.map((a) => a.storage_path ?? '').filter(Boolean)
    if (paths.length) {
      const { getStorageSignedUrls, SIGNED_URL_TTL } = await import('@/lib/storage/signed-url')
      const fresh = await getStorageSignedUrls('service-case-files', paths, SIGNED_URL_TTL.SHORT)
      let k = 0
      for (const a of atts) if (a.storage_path) { a.file_url = fresh[k] ?? a.file_url; k++ }
    }
    const checklist = (Array.isArray(sc.checklist) ? sc.checklist : []) as ChecklistItem[]
    return {
      success: true,
      data: {
        checklist, attachments: atts, canEdit,
        canClose: canCloseCase(checklist) && ctx.hasPermission('cases.close'),
        signature: { image: (sc.customer_signature as string | null) ?? null, name: (sc.customer_signature_name as string | null) ?? null, signed_at: (sc.signed_at as string | null) ?? null },
      },
    }
  } catch (err) {
    return { success: false, error: formatError(err, 'Kunne ikke hente aflevering') }
  }
}

/** Opret standard-tjeklisten hvis sagen ingen har. */
export async function startCaseHandoverAction(caseId: string): Promise<ActionResult<ChecklistItem[]>> {
  try {
    const ctx = await getAuthenticatedClientWithRole()
    const { canEdit } = await handoverAccess(ctx, caseId)
    if (!canEdit) return { success: false, error: 'Manglende tilladelse til at redigere sagen' }
    const db = await admin()
    const { data: sc } = await db.from('service_cases').select('checklist').eq('id', caseId).maybeSingle()
    if (!sc) return { success: false, error: 'Sag ikke fundet' }
    if (Array.isArray(sc.checklist) && sc.checklist.length) return { success: true, data: sc.checklist as ChecklistItem[] }
    const { error } = await db.from('service_cases').update({ checklist: DEFAULT_CHECKLIST }).eq('id', caseId)
    if (error) return { success: false, error: 'Kunne ikke oprette tjekliste' }
    revalidateCase(caseId)
    return { success: true, data: DEFAULT_CHECKLIST }
  } catch (err) {
    return { success: false, error: formatError(err, 'Uventet fejl') }
  }
}

async function setItem(caseId: string, key: string, completed: boolean, attachmentId?: string | null) {
  const db = await admin()
  const { data: sc } = await db.from('service_cases').select('checklist').eq('id', caseId).maybeSingle()
  const list = (Array.isArray(sc?.checklist) ? sc!.checklist : []) as ChecklistItem[]
  const idx = list.findIndex((i) => i.key === key)
  if (idx < 0) return { ok: false as const, error: 'Ukendt tjeklistepunkt' }
  const next = list.map((i, n) => (n === idx ? { ...i, completed, completed_at: completed ? new Date().toISOString() : null, ...(attachmentId !== undefined ? { attachment_id: attachmentId } : {}) } : i))
  const { error } = await db.from('service_cases').update({ checklist: next }).eq('id', caseId)
  if (error) return { ok: false as const, error: 'Kunne ikke gemme tjeklisten' }
  return { ok: true as const, checklist: next }
}

export async function toggleHandoverItemAction(caseId: string, key: string, completed: boolean): Promise<ActionResult<ChecklistItem[]>> {
  try {
    const ctx = await getAuthenticatedClientWithRole()
    const { canEdit } = await handoverAccess(ctx, caseId)
    if (!canEdit) return { success: false, error: 'Manglende tilladelse til at redigere sagen' }
    if (typeof key !== 'string' || !/^[a-z0-9_]{1,40}$/.test(key)) return { success: false, error: 'Ugyldigt punkt' }
    const r = await setItem(caseId, key, !!completed)
    if (!r.ok) return { success: false, error: r.error }
    revalidateCase(caseId)
    return { success: true, data: r.checklist }
  } catch (err) {
    return { success: false, error: formatError(err, 'Uventet fejl') }
  }
}

export async function uploadHandoverPhotoAction(caseId: string, formData: FormData): Promise<ActionResult<ServiceCaseAttachment>> {
  try {
    const ctx = await getAuthenticatedClientWithRole()
    const { canEdit } = await handoverAccess(ctx, caseId)
    if (!canEdit) return { success: false, error: 'Manglende tilladelse til at redigere sagen' }
    const file = formData.get('file') as File | null
    const key = String(formData.get('category') ?? '')
    if (!/^[a-z0-9_]{1,40}$/.test(key)) return { success: false, error: 'Ugyldigt punkt' }
    if (!file || file.size === 0) return { success: false, error: 'Ingen fil valgt' }
    if (file.size > PHOTO_MAX_BYTES) return { success: false, error: 'Billedet er for stort (max 15 MB)' }
    if (!PHOTO_MIME.test(file.type || '')) return { success: false, error: 'Kun billeder (JPG, PNG, WEBP, HEIC)' }

    const db = await admin()
    const { data: sc } = await db.from('service_cases').select('checklist').eq('id', caseId).maybeSingle()
    if (!sc) return { success: false, error: 'Sag ikke fundet' }
    if (!(Array.isArray(sc.checklist) && (sc.checklist as ChecklistItem[]).some((i) => i.key === key))) return { success: false, error: 'Ukendt tjeklistepunkt' }

    const ext = (file.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg').replace(/[^a-z0-9]/g, '').slice(0, 5)
    const storagePath = `service-cases/${caseId}/${key}_${Date.now()}.${ext}`
    const { error: upErr } = await db.storage.from('service-case-files').upload(storagePath, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false })
    if (upErr) {
      logger.error('uploadHandoverPhoto: storage', { error: upErr, entityId: caseId })
      return { success: false, error: 'Upload fejlede' }
    }
    const { data: att, error } = await db.from('service_case_attachments').insert({
      service_case_id: caseId, file_name: file.name.slice(0, 200), file_url: '', storage_path: storagePath, mime_type: file.type,
      file_size: file.size, category: key, uploaded_by: ctx.userId,
    }).select('*').single()
    if (error || !att) {
      await db.storage.from('service-case-files').remove([storagePath])
      return { success: false, error: 'Kunne ikke gemme billedet' }
    }
    await setItem(caseId, key, true, (att as { id: string }).id)
    revalidateCase(caseId)
    return { success: true, data: att as ServiceCaseAttachment }
  } catch (err) {
    return { success: false, error: formatError(err, 'Uventet fejl') }
  }
}

/** Slet et afleveringsfoto: kontor (cases.edit) eller den der uploadede det (på egen sag). */
export async function deleteHandoverPhotoAction(caseId: string, attachmentId: string): Promise<ActionResult> {
  try {
    validateUUID(attachmentId, 'bilags-ID')
    const ctx = await getAuthenticatedClientWithRole()
    const { canEdit } = await handoverAccess(ctx, caseId)
    if (!canEdit) return { success: false, error: 'Manglende tilladelse til at redigere sagen' }
    const db = await admin()
    const { data: att } = await db.from('service_case_attachments').select('id, storage_path, uploaded_by, category').eq('id', attachmentId).eq('service_case_id', caseId).maybeSingle()
    if (!att) return { success: false, error: 'Billedet findes ikke på sagen' }
    if (!ctx.hasPermission('cases.edit') && att.uploaded_by !== ctx.userId) return { success: false, error: 'Du kan kun slette dine egne billeder' }
    if (att.storage_path) await db.storage.from('service-case-files').remove([att.storage_path as string])
    const { error } = await db.from('service_case_attachments').delete().eq('id', attachmentId)
    if (error) return { success: false, error: 'Kunne ikke slette billedet' }
    // Punktet er ikke længere dokumenteret, hvis det var det eneste billede
    const { count } = await db.from('service_case_attachments').select('id', { count: 'exact', head: true }).eq('service_case_id', caseId).eq('category', att.category as string)
    if ((count ?? 0) === 0 && typeof att.category === 'string' && att.category.endsWith('_photo')) await setItem(caseId, att.category, false, null)
    revalidateCase(caseId)
    return { success: true }
  } catch (err) {
    return { success: false, error: formatError(err, 'Uventet fejl') }
  }
}

/** Kundens underskrift ved aflevering (lukker IKKE sagen). Kontor (cases.close) eller montør på egen sag. */
export async function signCaseHandoverAction(caseId: string, signature: string, signerName: string): Promise<ActionResult> {
  try {
    const ctx = await getAuthenticatedClientWithRole()
    const { canEdit } = await handoverAccess(ctx, caseId)
    if (!(ctx.hasPermission('cases.close') || canEdit)) return { success: false, error: 'Manglende tilladelse' }
    const name = String(signerName ?? '').trim()
    if (!name || name.length > 120) return { success: false, error: 'Skriv kundens navn' }
    if (typeof signature !== 'string' || !signature.startsWith('data:image/png;base64,') || signature.length > SIGNATURE_MAX_CHARS) {
      return { success: false, error: 'Ugyldig underskrift' }
    }
    const db = await admin()
    const { data, error } = await db.from('service_cases').update({
      customer_signature: signature, customer_signature_name: name, signed_at: new Date().toISOString(),
    }).eq('id', caseId).select('id')
    if (error || !(data ?? []).length) return { success: false, error: 'Kunne ikke gemme underskrift' }
    revalidateCase(caseId)
    return { success: true }
  } catch (err) {
    return { success: false, error: formatError(err, 'Uventet fejl') }
  }
}
